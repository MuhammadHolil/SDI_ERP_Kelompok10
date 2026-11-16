import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

function editablePeriods(periods = []) {
  return periods.map((period) => ({
    startDate: String(period.startDate).slice(0, 10),
    endDate: String(period.endDate).slice(0, 10),
    availableHours: period.availableHours,
  }));
}

export default function ExpertCapacity({ experts = [] }) {
  const [form] = Form.useForm();
  const [expertId, setExpertId] = useState('');
  const [capacity, setCapacity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    setCapacity(null);
    setError('');
    form.resetFields();

    if (!expertId) {
      setLoading(false);
      return;
    }

    async function loadCapacity() {
      setLoading(true);

      try {
        const response = await request.get({
          entity: `expert/capacity/${expertId}`,
        });

        if (!active) return;

        if (!response?.success) {
          throw new Error(
            response?.message || 'Kapasitas gagal dimuat.'
          );
        }

        setCapacity(response.result);

        form.setFieldsValue({
          capacityPeriods: editablePeriods(
            response.result.capacityPeriods
          ),
        });
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCapacity();

    return () => {
      active = false;
    };
  }, [expertId, reload, form]);

  async function saveCapacity(values) {
    if (!capacity) return;

    setSaving(true);
    setError('');

    try {
      const periods = values.capacityPeriods || [];

      if (!periods.length) {
        throw new Error('Tambahkan minimal satu periode kapasitas.');
      }

      for (const period of periods) {
        if (period.endDate < period.startDate) {
          throw new Error(
            'Tanggal selesai tidak boleh sebelum tanggal mulai.'
          );
        }
      }

      const sorted = [...periods].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      );

      for (let index = 1; index < sorted.length; index += 1) {
        if (
          sorted[index].startDate <= sorted[index - 1].endDate
        ) {
          throw new Error(
            'Periode kapasitas tidak boleh saling bertumpuk.'
          );
        }
      }

      const response = await request.put({
        entity: `expert/capacity/${expertId}`,
        jsonData: {
          expectedRevision: capacity.capacityRevision,
          capacityPeriods: periods.map((period) => ({
            startDate: period.startDate,
            endDate: period.endDate,
            availableHours: period.availableHours,
          })),
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Kapasitas gagal disimpan.'
        );
      }

      setCapacity(response.result);

      form.setFieldsValue({
        capacityPeriods: editablePeriods(
          response.result.capacityPeriods
        ),
      });

      message.success('Kapasitas tenaga ahli berhasil disimpan.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      <Typography.Title level={3}>
        Kapasitas Tenaga Ahli
      </Typography.Title>

      <Typography.Paragraph>
        Tentukan jumlah jam tersedia untuk setiap periode.
        Sistem akan membandingkannya dengan jam yang
        sudah dialokasikan ke proyek.
      </Typography.Paragraph>

      <Select
        aria-label="Pilih tenaga ahli untuk kapasitas"
        placeholder="Pilih tenaga ahli"
        showSearch
        optionFilterProp="label"
        value={expertId || undefined}
        disabled={saving}
        onChange={(value) => {
          setExpertId(value);
          setCapacity(null);
          setError('');
        }}
        style={{
          width: '100%',
          maxWidth: 600,
          marginBottom: 16,
        }}
        options={experts.map((expert) => ({
          value: expert._id,
          label: `${expert.code} — ${expert.name}`,
        }))}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      {expertId && (
        <Button
          loading={loading}
          disabled={saving}
          onClick={() => setReload((value) => value + 1)}
          style={{ marginBottom: 16 }}
        >
          Muat ulang kapasitas
        </Button>
      )}

      {capacity && (
        <>
          <Alert
            type="info"
            showIcon
            message="Pertahankan periode yang masih digunakan."
            description="Penyimpanan mengganti seluruh daftar periode kapasitas. Periode baru harus tetap mencakup alokasi berjalan dan jumlah jamnya tidak boleh lebih kecil dari jam yang telah dialokasikan."
            style={{ marginBottom: 16 }}
          />

          <Form
            form={form}
            layout="vertical"
            onFinish={saveCapacity}
            disabled={saving || loading}
            style={{ maxWidth: 700 }}
          >
            <Form.List name="capacityPeriods">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name }) => (
                    <div
                      key={key}
                      style={{
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        padding: 16,
                        marginBottom: 16,
                      }}
                    >
                      <Typography.Title level={5}>
                        Periode {name + 1}
                      </Typography.Title>

                      <Form.Item
                        name={[name, 'startDate']}
                        label="Tanggal mulai"
                        rules={[
                          {
                            required: true,
                            message: 'Tanggal mulai wajib diisi.',
                          },
                        ]}
                      >
                        <Input type="date" />
                      </Form.Item>

                      <Form.Item
                        name={[name, 'endDate']}
                        label="Tanggal selesai"
                        rules={[
                          {
                            required: true,
                            message: 'Tanggal selesai wajib diisi.',
                          },
                        ]}
                      >
                        <Input type="date" />
                      </Form.Item>

                      <Form.Item
                        name={[name, 'availableHours']}
                        label="Jumlah jam tersedia"
                        rules={[
                          {
                            required: true,
                            message: 'Jumlah jam wajib diisi.',
                          },
                          {
                            type: 'number',
                            min: 0,
                            message: 'Jam tidak boleh negatif.',
                          },
                        ]}
                      >
                        <InputNumber
                          min={0}
                          precision={2}
                          style={{ width: '100%' }}
                        />
                      </Form.Item>

                      <Button
                        danger
                        onClick={() => remove(name)}
                      >
                        Hapus periode
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="dashed"
                    block
                    onClick={() => add({ availableHours: 160 })}
                    style={{ marginBottom: 16 }}
                  >
                    Tambah Periode
                  </Button>
                </>
              )}
            </Form.List>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Simpan Kapasitas
              </Button>
            </Form.Item>
          </Form>

          <Typography.Title level={4}>
            Kapasitas Tersimpan
          </Typography.Title>

          <Table
            rowKey={(row) => row.startDate}
            dataSource={capacity.capacityPeriods || []}
            pagination={false}
            scroll={{ x: true }}
            columns={[
              {
                title: 'Mulai',
                dataIndex: 'startDate',
              },
              {
                title: 'Selesai',
                dataIndex: 'endDate',
              },
              {
                title: 'Jam tersedia',
                dataIndex: 'availableHours',
              },
              {
                title: 'Jam dialokasikan',
                dataIndex: 'allocatedHours',
              },
              {
                title: 'Sisa jam',
                dataIndex: 'remainingHours',
              },
            ]}
          />
        </>
      )}
    </div>
  );
}