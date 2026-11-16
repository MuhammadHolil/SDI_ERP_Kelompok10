import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

const configurations = {
  service: {
    label: 'Layanan',
    fields: ['code', 'name', 'unit'],
  },
  costcategory: {
    label: 'Kategori Biaya',
    fields: ['code', 'name'],
  },
  vendor: {
    label: 'Vendor',
    fields: ['code', 'name', 'email'],
  },
};

const fieldLabels = {
  code: 'Kode',
  name: 'Nama',
  unit: 'Satuan',
  email: 'Email',
};

async function readRows(entity) {
  if (entity !== 'vendor') {
    const response = await request.get({
      entity: `${entity}/list`,
    });

    if (!response?.success) {
      throw new Error(response?.message || 'Data gagal dimuat.');
    }

    return response.result || [];
  }

  // Daftar vendor menggunakan pagination dari backend.
  const rows = [];

  for (let page = 1; page <= 1000; page += 1) {
    const response = await request.get({
      entity: `vendor/list?page=${page}&limit=100`,
    });

    if (!response?.success) {
      throw new Error(response?.message || 'Vendor gagal dimuat.');
    }

    const batch = response.result || [];
    rows.push(...batch);

    const total = response.pagination?.total;

    if (
      batch.length < 100 ||
      (typeof total === 'number' && rows.length >= total)
    ) {
      return rows;
    }
  }

  throw new Error('Daftar vendor terlalu besar untuk dimuat sekaligus.');
}

export default function MasterData() {
  const [form] = Form.useForm();
  const [entity, setEntity] = useState('service');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const configuration = configurations[entity];

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError('');
    setRows([]);

    readRows(entity)
      .then((result) => {
        if (active) setRows(result);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [entity, reload]);

  async function handleSave(values) {
    setSaving(true);
    setError('');

    try {
      const payload = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
      };

      if (entity === 'service') {
        payload.unit = values.unit.trim();
      }

      if (entity === 'vendor') {
        payload.email = values.email?.trim() || '';
      }

      const response = await request.post({
        entity: `${entity}/create`,
        jsonData: payload,
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Data gagal disimpan.'
        );
      }

      message.success(
        response.message || 'Data berhasil disimpan.'
      );

      form.resetFields();
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function changeTab(key) {
    if (saving) return;

    form.resetFields();
    setError('');
    setEntity(key);
  }

  const columns = configuration.fields.map((field) => ({
    title: fieldLabels[field],
    dataIndex: field,
    key: field,
  }));

  return (
    <div>
      <Typography.Title level={2}>
        Master Data
      </Typography.Title>

      <Tabs
        activeKey={entity}
        onChange={changeTab}
        items={Object.entries(configurations).map(
          ([key, value]) => ({
            key,
            label: value.label,
            disabled: saving,
          })
        )}
      />

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Typography.Title level={4}>
        Tambah {configuration.label}
      </Typography.Title>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        disabled={saving}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="code"
          label="Kode"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Kode wajib diisi.',
            },
            {
              pattern:
                entity === 'costcategory'
                  ? /^[A-Za-z0-9_]+$/
                  : /^[A-Za-z0-9_-]+$/,
              message:
                entity === 'costcategory'
                  ? 'Gunakan huruf, angka, atau garis bawah.'
                  : 'Gunakan huruf, angka, garis bawah, atau tanda hubung.',
            },
          ]}
        >
          <Input maxLength={50} />
        </Form.Item>

        <Form.Item
          name="name"
          label="Nama"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Nama wajib diisi.',
            },
          ]}
        >
          <Input
            maxLength={entity === 'costcategory' ? 150 : 200}
          />
        </Form.Item>

        {entity === 'service' && (
          <Form.Item
            name="unit"
            label="Satuan"
            rules={[
              {
                required: true,
                whitespace: true,
                message: 'Satuan wajib diisi.',
              },
            ]}
          >
            <Input maxLength={50} placeholder="Contoh: proyek" />
          </Form.Item>
        )}

        {entity === 'vendor' && (
          <Form.Item
            name="email"
            label="Email (opsional)"
            rules={[
              {
                type: 'email',
                message: 'Format email tidak valid.',
              },
            ]}
          >
            <Input maxLength={254} />
          </Form.Item>
        )}

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
            >
              Simpan
            </Button>

            <Button onClick={() => form.resetFields()}>
              Kosongkan
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Space style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Daftar {configuration.label}
        </Typography.Title>

        <Button
          onClick={() => setReload((value) => value + 1)}
          disabled={saving}
          loading={loading}
        >
          Muat ulang
        </Button>
      </Space>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: true }}
      />
    </div>
  );
}