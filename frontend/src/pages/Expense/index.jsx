import { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Select, Space, Table, Tag } from 'antd';
import axios from 'axios';

import { request } from '@/request';
import storePersist from '@/redux/storePersist';
import { API_BASE_URL } from '@/config/serverApiConfig';

export default function Expense() {
  const [form] = Form.useForm();
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadData() {
    const [categoryResponse, expenseResponse] = await Promise.all([
      request.list({ entity: 'costcategory', options: { limit: 100 } }),
      request.list({ entity: 'expense', options: { limit: 100 } }),
    ]);

    if (categoryResponse.success) {
      setCategories(categoryResponse.result.filter((item) => item.active));
    } else {
      setError(categoryResponse.message || 'Kategori biaya gagal dimuat.');
    }

    if (expenseResponse.success) {
      setExpenses(expenseResponse.result);
    } else {
      setError(expenseResponse.message || 'Pengeluaran gagal dimuat.');
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function createDraft(values) {
    setBusy(true);
    setError('');

    try {
      const response = await request.post({
        entity: 'expense/create',
        jsonData: {
          project: values.project.trim(),
          category: values.category,
          transactionDate: values.transactionDate.format('YYYY-MM-DD'),
          description: values.description.trim(),
          amount: values.amount,
        },
      });

      if (!response.success) {
        setError(response.message || 'Draft gagal dibuat.');
        return;
      }

      form.resetFields();
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(expenseId) {
    const file = files[expenseId];

    if (!file) {
      setError('Pilih berkas bukti terlebih dahulu.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const auth = storePersist.get('auth');
      const token = auth?.current?.token;
      const body = new FormData();
      body.append('file', file);

      await axios.post(
        `${API_BASE_URL}expense/evidence/${expenseId}`,
        body,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setFiles((current) => ({ ...current, [expenseId]: null }));
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Bukti gagal diunggah.');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(expenseId) {
    setBusy(true);
    setError('');

    try {
      const response = await request.post({
        entity: `expense/submit/${expenseId}`,
        jsonData: {},
      });

      if (!response.success) {
        setError(response.message || 'Pengeluaran gagal diajukan.');
        return;
      }

      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { title: 'Proyek', dataIndex: 'project', render: (value) => value?.code || '-' },
    { title: 'Uraian', dataIndex: 'description' },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      render: (value) => `Rp ${Number(value).toLocaleString('id-ID')}`,
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Tindakan',
      render: (_, row) =>
        row.approvalStatus === 'draft' ? (
          <Space direction="vertical">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(event) =>
                setFiles((current) => ({
                  ...current,
                  [row._id]: event.target.files?.[0] || null,
                }))
              }
            />
            <Space>
              <Button disabled={busy} onClick={() => uploadEvidence(row._id)}>
                Unggah bukti
              </Button>
              <Button type="primary" disabled={busy} onClick={() => submitExpense(row._id)}>
                Ajukan
              </Button>
            </Space>
          </Space>
        ) : null,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>Pengeluaran Proyek</h1>
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" onFinish={createDraft}>
        <Form.Item
          name="project"
          label="ID proyek"
          rules={[{ required: true, message: 'Masukkan ID proyek.' }]}
        >
          <Input placeholder="ID proyek dari PM" />
        </Form.Item>

        <Form.Item
          name="category"
          label="Kategori biaya"
          rules={[{ required: true, message: 'Pilih kategori biaya.' }]}
        >
          <Select
            options={categories.map((item) => ({
              value: item._id,
              label: `${item.code} — ${item.name}`,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="transactionDate"
          label="Tanggal transaksi"
          rules={[{ required: true, message: 'Pilih tanggal transaksi.' }]}
        >
          <DatePicker format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Uraian"
          rules={[{ required: true, message: 'Isi uraian pengeluaran.' }]}
        >
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item
          name="amount"
          label="Nominal (Rp)"
          rules={[{ required: true, message: 'Isi nominal.' }]}
        >
          <InputNumber min={0.01} precision={2} style={{ width: 240 }} />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={busy}>
          Simpan draft
        </Button>
      </Form>

      <h2 style={{ marginTop: 32 }}>Daftar Pengeluaran</h2>
      <Button onClick={loadData} style={{ marginBottom: 12 }}>Muat ulang</Button>
      <Table rowKey="_id" dataSource={expenses} columns={columns} scroll={{ x: 850 }} />
    </div>
  );
}