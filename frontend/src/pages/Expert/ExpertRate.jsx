import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

export default function ExpertRate({ experts = [] }) {
  const [form] = Form.useForm();
  const [expertId, setExpertId] = useState('');
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    setRates([]);
    setError('');

    if (!expertId) {
      setLoading(false);
      return;
    }

    async function loadRates() {
      setLoading(true);

      try {
        const response = await request.get({
          entity: `expertrate/list?expert=${expertId}`,
        });

        if (!active) return;

        if (!response?.success) {
          throw new Error(
            response?.message || 'Tarif gagal dimuat.'
          );
        }

        setRates(response.result || []);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRates();

    return () => {
      active = false;
    };
  }, [expertId, reload]);

  async function createRate(values) {
    if (!expertId) {
      setError('Pilih tenaga ahli terlebih dahulu.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (
        values.effectiveTo &&
        values.effectiveTo < values.effectiveFrom
      ) {
        throw new Error(
          'Tanggal akhir tidak boleh sebelum tanggal mulai.'
        );
      }

      const response = await request.post({
        entity: 'expertrate/create',
        jsonData: {
          expert: expertId,
          hourlyCost: values.hourlyCost,
          currency: values.currency,
          effectiveFrom: values.effectiveFrom,
          effectiveTo: values.effectiveTo || null,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Tarif gagal disimpan.'
        );
      }

      message.success('Tarif tenaga ahli berhasil disimpan.');
      form.resetFields();
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function changeExpert(value) {
    setExpertId(value);
    setRates([]);
    setError('');
    form.resetFields();
  }

  function dateLabel(value) {
    return value ? String(value).slice(0, 10) : 'Tanpa batas akhir';
  }

  return (
    <div style={{ marginTop: 32 }}>
      <Typography.Title level={3}>
        Tarif Tenaga Ahli
      </Typography.Title>

      <Typography.Paragraph>
        Pilih tenaga ahli, lalu tentukan biaya per jam
        beserta periode berlakunya.
      </Typography.Paragraph>

      <Select
        aria-label="Pilih tenaga ahli untuk tarif"
        placeholder="Pilih tenaga ahli"
        showSearch
        optionFilterProp="label"
        value={expertId || undefined}
        onChange={changeExpert}
        disabled={saving}
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
        <>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ currency: 'IDR' }}
            onFinish={createRate}
            disabled={saving || loading}
            style={{ maxWidth: 600 }}
          >
            <Form.Item
              name="hourlyCost"
              label="Biaya per jam"
              rules={[
                {
                  required: true,
                  message: 'Biaya per jam wajib diisi.',
                },
                {
                  type: 'number',
                  min: 0.01,
                  message: 'Biaya harus lebih dari nol.',
                },
              ]}
            >
              <InputNumber
                min={0.01}
                precision={2}
                style={{ width: '100%' }}
              />
            </Form.Item>

            <Form.Item
              name="currency"
              label="Mata uang"
              rules={[
                {
                  required: true,
                  message: 'Mata uang wajib diisi.',
                },
              ]}
            >
              <Select
                options={[
                  { value: 'IDR', label: 'IDR — Rupiah' },
                  { value: 'USD', label: 'USD — Dolar AS' },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="effectiveFrom"
              label="Berlaku mulai"
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
              name="effectiveTo"
              label="Berlaku sampai (opsional)"
              extra="Kosongkan jika belum ditentukan tanggal akhirnya."
            >
              <Input type="date" />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Simpan Tarif
              </Button>
            </Form.Item>
          </Form>

          <Button
            onClick={() => setReload((value) => value + 1)}
            disabled={saving}
            loading={loading}
            style={{ marginBottom: 16 }}
          >
            Muat ulang tarif
          </Button>

          <Table
            rowKey="_id"
            loading={loading}
            dataSource={rates}
            pagination={{ pageSize: 10 }}
            scroll={{ x: true }}
            columns={[
              {
                title: 'Biaya per jam',
                dataIndex: 'hourlyCost',
                render: (value) =>
                  Number(value).toLocaleString('id-ID'),
              },
              {
                title: 'Mata uang',
                dataIndex: 'currency',
              },
              {
                title: 'Berlaku mulai',
                dataIndex: 'effectiveFrom',
                render: dateLabel,
              },
              {
                title: 'Berlaku sampai',
                dataIndex: 'effectiveTo',
                render: dateLabel,
              },
            ]}
          />
        </>
      )}
    </div>
  );
}