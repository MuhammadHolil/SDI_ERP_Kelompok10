import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

const roleOptions = [
  { value: 'sales', label: 'Sales' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'expert', label: 'Tenaga Ahli' },
  { value: 'project_team', label: 'Pencatat Pengeluaran' },
  { value: 'expense_approver', label: 'Pemeriksa Pengeluaran' },
  { value: 'finance', label: 'Keuangan' },
  { value: 'management', label: 'Manajemen' },
];

const required = [
  { required: true, message: 'Bagian ini wajib diisi.' },
];

export default function UserAccount() {
  const [form] = Form.useForm();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await request.get({
          entity: `admin/list?page=${page}&limit=10`,
        });

        if (!active) return;

        if (!response?.success) {
          throw new Error(
            response?.message || 'Daftar akun gagal dimuat.'
          );
        }

        setRows(response.result || []);
        setTotal(response.pagination?.total || 0);
      } catch (err) {
        if (active) {
          setRows([]);
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
  }, [page, reload]);

  async function createAccount(values) {
    setSaving(true);
    setError('');

    try {
      const response = await request.post({
        entity: 'admin/create',
        jsonData: {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          password: values.password,
          businessRoles: values.businessRoles,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Akun gagal dibuat.'
        );
      }

      message.success('Akun pengguna berhasil dibuat.');
      form.resetFields();
      setPage(1);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { title: 'Nama', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Jenis akun',
      dataIndex: 'role',
      render: (value) => value === 'owner' ? 'Owner' : 'Anggota',
    },
    {
      title: 'Peran bisnis',
      dataIndex: 'businessRoles',
      render: (values = []) =>
        values.map((role) => (
          <Tag key={role}>
            {roleOptions.find((item) => item.value === role)
              ?.label || role}
          </Tag>
        )),
    },
    {
      title: 'Status',
      dataIndex: 'enabled',
      render: (value) => value ? 'Aktif' : 'Tidak aktif',
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Akun Pengguna
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Typography.Title level={4}>
        Tambah Akun
      </Typography.Title>

      <Form
        form={form}
        layout="vertical"
        onFinish={createAccount}
        disabled={saving}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="name"
          label="Nama pengguna"
          rules={[
            ...required,
            { whitespace: true, message: 'Nama wajib diisi.' },
          ]}
        >
          <Input maxLength={100} />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            ...required,
            { type: 'email', message: 'Email tidak valid.' },
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Kata sandi"
          extra="Minimal 12 karakter dan maksimal 40 byte."
          rules={[
            ...required,
            { min: 12, message: 'Minimal 12 karakter.' },
            {
              validator: (_, value) => {
                if (
                  !value ||
                  new TextEncoder().encode(value).length <= 40
                ) {
                  return Promise.resolve();
                }

                return Promise.reject(
                  new Error('Kata sandi maksimal 40 byte.')
                );
              },
            },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="businessRoles"
          label="Peran bisnis"
          rules={required}
        >
          <Select
            mode="multiple"
            options={roleOptions}
            placeholder="Pilih peran pengguna"
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
            >
              Buat Akun
            </Button>

            <Button onClick={() => form.resetFields()}>
              Kosongkan
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Button
        onClick={() => setReload((value) => value + 1)}
        disabled={saving}
        loading={loading}
        style={{ marginBottom: 16 }}
      >
        Muat ulang daftar
      </Button>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: true }}
        pagination={{
          current: page,
          pageSize: 10,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />
    </div>
  );
}