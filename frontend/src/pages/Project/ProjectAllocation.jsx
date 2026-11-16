import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

async function loadAll(entity, parameters = {}) {
  const records = [];

  for (let page = 1; page <= 1000; page += 1) {
    const query = new URLSearchParams({
      ...parameters,
      page,
      limit: 100,
    });

    const response = await request.get({
      entity: `${entity}/list?${query.toString()}`,
    });

    if (!response?.success) {
      throw new Error(
        response?.message || `Daftar ${entity} gagal dimuat.`
      );
    }

    const batch = response.result || [];
    records.push(...batch);

    const total = response.pagination?.total;

    if (
      batch.length < 100 ||
      (typeof total === 'number' && records.length >= total)
    ) {
      return records;
    }
  }

  throw new Error('Daftar terlalu besar untuk dimuat sekaligus.');
}

export default function ProjectAllocation({ project }) {
  const [experts, setExperts] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [expertRows, allocationRows] = await Promise.all([
          loadAll('expert'),
          loadAll('allocation', { project: project._id }),
        ]);

        if (!active) return;

        setExperts(expertRows);
        setAllocations(allocationRows);
      } catch (err) {
        if (active) {
          setExperts([]);
          setAllocations([]);
          setError(err.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [project._id, reload]);

  async function createAllocation(values) {
    setSaving(true);
    setFormError('');

    try {
      if (values.endDate < values.startDate) {
        throw new Error(
          'Tanggal selesai tidak boleh sebelum tanggal mulai.'
        );
      }

      if (
        values.startDate < dateOnly(project.startDate) ||
        values.endDate > dateOnly(project.endDate)
      ) {
        throw new Error(
          'Periode alokasi harus berada dalam periode proyek.'
        );
      }

      const response = await request.post({
        entity: 'allocation/create',
        jsonData: {
          project: project._id,
          expert: values.expert,
          projectRole: values.projectRole.trim(),
          startDate: values.startDate,
          endDate: values.endDate,
          plannedHours: values.plannedHours,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Alokasi gagal disimpan.'
        );
      }

      message.success('Alokasi tenaga ahli berhasil dibuat.');
      setOpen(false);
      setReload((value) => value + 1);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <Typography.Title level={4}>
        Alokasi Tenaga Ahli
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          disabled={loading || Boolean(error) || !experts.length}
          onClick={() => {
            setFormError('');
            setOpen(true);
          }}
        >
          Tambah Alokasi
        </Button>

        <Button
          loading={loading}
          disabled={saving}
          onClick={() => setReload((value) => value + 1)}
        >
          Muat ulang alokasi
        </Button>
      </Space>

      {!loading && !error && !experts.length && (
        <Alert
          type="info"
          message="Data tenaga ahli belum tersedia."
          description="Owner perlu membuat data tenaga ahli beserta kapasitasnya terlebih dahulu."
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="_id"
        loading={loading}
        dataSource={allocations}
        pagination={{ pageSize: 10 }}
        scroll={{ x: true }}
        columns={[
          {
            title: 'Tenaga ahli',
            render: (_, row) =>
              row.expert?.name || row.expert?.code || '-',
          },
          {
            title: 'Peran dalam proyek',
            dataIndex: 'projectRole',
          },
          {
            title: 'Mulai',
            dataIndex: 'startDate',
            render: dateOnly,
          },
          {
            title: 'Selesai',
            dataIndex: 'endDate',
            render: dateOnly,
          },
          {
            title: 'Rencana jam',
            dataIndex: 'plannedHours',
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value) => <Tag>{value}</Tag>,
          },
        ]}
      />

      {open && (
        <Modal
          open
          title="Alokasikan Tenaga Ahli"
          width={700}
          footer={null}
          closable={!saving}
          maskClosable={!saving}
          onCancel={() => setOpen(false)}
        >
          <Typography.Paragraph>
            Proyek: <strong>{project.code}</strong>.
            Periode alokasi harus berada pada{' '}
            {dateOnly(project.startDate)} sampai{' '}
            {dateOnly(project.endDate)}.
          </Typography.Paragraph>

          {formError && (
            <Alert
              type="error"
              showIcon
              message={formError}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            layout="vertical"
            onFinish={createAllocation}
            disabled={saving}
          >
            <Form.Item
              name="expert"
              label="Tenaga ahli"
              rules={[
                {
                  required: true,
                  message: 'Pilih tenaga ahli.',
                },
              ]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={experts.map((expert) => ({
                  value: expert._id,
                  label: `${expert.code} — ${expert.name}`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="projectRole"
              label="Peran dalam proyek"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: 'Peran wajib diisi.',
                },
              ]}
            >
              <Input
                maxLength={200}
                placeholder="Contoh: Konsultan implementasi ERP"
              />
            </Form.Item>

            <Form.Item
              name="startDate"
              label="Tanggal mulai alokasi"
              rules={[
                {
                  required: true,
                  message: 'Tanggal mulai wajib diisi.',
                },
              ]}
            >
              <Input
                type="date"
                min={dateOnly(project.startDate)}
                max={dateOnly(project.endDate)}
              />
            </Form.Item>

            <Form.Item
              name="endDate"
              label="Tanggal selesai alokasi"
              rules={[
                {
                  required: true,
                  message: 'Tanggal selesai wajib diisi.',
                },
              ]}
            >
              <Input
                type="date"
                min={dateOnly(project.startDate)}
                max={dateOnly(project.endDate)}
              />
            </Form.Item>

            <Form.Item
              name="plannedHours"
              label="Rencana jam kerja"
              extra="Contoh: 0,25 jam sama dengan 15 menit."
              rules={[
                {
                  required: true,
                  message: 'Rencana jam wajib diisi.',
                },
                {
                  type: 'number',
                  min: 0.01,
                  message: 'Jam harus lebih dari nol.',
                },
              ]}
            >
              <InputNumber
                min={0.01}
                precision={2}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Simpan Alokasi
              </Button>

              <Button onClick={() => setOpen(false)}>
                Batal
              </Button>
            </Space>
          </Form>
        </Modal>
      )}
    </div>
  );
}