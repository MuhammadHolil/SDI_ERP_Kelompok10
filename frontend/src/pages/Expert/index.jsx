import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

import ExpertCapacity from './ExpertCapacity';

import ExpertRate from './ExpertRate';

async function loadAll(entity) {
  const rows = [];

  for (let page = 1; page <= 1000; page += 1) {
    const response = await request.get({
      entity: `${entity}/list?page=${page}&limit=100`,
    });

    if (!response?.success) {
      throw new Error(
        response?.message || `Daftar ${entity} gagal dimuat.`
      );
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

  throw new Error('Daftar terlalu besar untuk dimuat sekaligus.');
}

export default function Expert() {
  const [form] = Form.useForm();
  const [experts, setExperts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [expertRows, accountRows] = await Promise.all([
          loadAll('expert'),
          loadAll('admin'),
        ]);

        if (!active) return;

        setExperts(expertRows);
        setAccounts(accountRows);
      } catch (err) {
        if (active) {
          setExperts([]);
          setAccounts([]);
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
  }, [reload]);

  const availableAccounts = accounts.filter((account) => {
    const hasExpertRole =
      account.businessRoles?.includes('expert');

    const alreadyLinked = experts.some((expert) => {
      const userId = expert.user?._id || expert.user;
      return String(userId) === String(account._id);
    });

    return account.enabled && hasExpertRole && !alreadyLinked;
  });

  async function createExpert(values) {
    setSaving(true);
    setError('');

    try {
      const skills = [
        ...new Set(
          (values.skills || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        ),
      ];

      if (skills.length > 30) {
        throw new Error('Maksimal 30 keahlian.');
      }

      if (skills.some((item) => item.length > 100)) {
        throw new Error('Setiap keahlian maksimal 100 karakter.');
      }

      const response = await request.post({
        entity: 'expert/create',
        jsonData: {
          code: values.code.trim().toUpperCase(),
          name: values.name.trim(),
          user: values.user,
          skills,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Tenaga ahli gagal dibuat.'
        );
      }

      message.success('Tenaga ahli berhasil ditambahkan.');
      form.resetFields();
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const columns = [ 
    {
      title: 'Kode',
      dataIndex: 'code',
    },
    {
      title: 'Nama tenaga ahli',
      dataIndex: 'name',
    },
    {
      title: 'Akun login',
      render: (_, row) => {
        const userId = row.user?._id || row.user;

        const account = accounts.find(
          (item) => String(item._id) === String(userId)
        );

        return account
          ? `${account.name} (${account.email})`
          : 'Akun tidak tersedia dalam daftar';
      },
    },
    {
      title: 'Keahlian',
      dataIndex: 'skills',
      render: (values = []) => values.join(', ') || '-',
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Tenaga Ahli
      </Typography.Title>

      <Typography.Paragraph>
        Hubungkan akun pengguna dengan data tenaga ahli
        sebelum mengatur tarif, kapasitas, dan alokasi proyek.
      </Typography.Paragraph>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && !error && availableAccounts.length === 0 && (
        <Alert
          type="info"
          message="Belum ada akun tenaga ahli yang dapat dipilih."
          description="Buat akun dengan peran Tenaga Ahli melalui menu Akun Pengguna, kemudian muat ulang halaman ini."
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={createExpert}
        disabled={saving || loading || Boolean(error)}
        style={{ maxWidth: 600 }}
      >
        <Form.Item
          name="code"
          label="Kode tenaga ahli"
          rules={[
            {
              required: true,
              message: 'Kode wajib diisi.',
            },
            {
              pattern: /^[A-Za-z0-9_-]+$/,
              message:
                'Gunakan huruf, angka, garis bawah, atau tanda hubung.',
            },
          ]}
        >
          <Input maxLength={50} />
        </Form.Item>

        <Form.Item
          name="name"
          label="Nama tenaga ahli"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Nama wajib diisi.',
            },
          ]}
        >
          <Input maxLength={200} />
        </Form.Item>

        <Form.Item
          name="user"
          label="Akun login tenaga ahli"
          rules={[
            {
              required: true,
              message: 'Pilih akun tenaga ahli.',
            },
          ]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih akun yang sudah dibuat"
            options={availableAccounts.map((account) => ({
              value: account._id,
              label: `${account.name} (${account.email})`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="skills"
          label="Keahlian (opsional)"
          extra="Pisahkan beberapa keahlian menggunakan koma."
        >
          <Input.TextArea
            rows={3}
            placeholder="Contoh: Implementasi ERP, Pengujian aplikasi"
          />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              disabled={!availableAccounts.length}
            >
              Simpan Tenaga Ahli
            </Button>

            <Button onClick={() => form.resetFields()}>
              Kosongkan
            </Button>
          </Space>
        </Form.Item>
      </Form>

      <Button
        onClick={() => setReload((value) => value + 1)}
        loading={loading}
        disabled={saving}
        style={{ marginBottom: 16 }}
      >
        Muat ulang daftar
      </Button>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={experts}
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: true }}
      />
      <ExpertRate experts={experts} />
      <ExpertCapacity experts={experts} />
    </div>
  );
}