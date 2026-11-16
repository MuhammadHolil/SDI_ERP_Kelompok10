import { useState } from 'react';
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
  Typography,
  message,
} from 'antd';
import currency from 'currency.js';

import { request } from '@/request';

const required = [
  { required: true, message: 'Bagian ini wajib diisi.' },
];

export default function ProjectBudget({
  projectId,
  budgets = [],
  onSaved,
}) {
  const [mode, setMode] = useState('');
  const [categories, setCategories] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const draft = budgets.find(
    (budget) =>
      budget.version === 1 &&
      budget.approvalStatus === 'draft' &&
      !budget.isCurrent
  );

  async function openForm(nextMode) {
    setMode(nextMode);
    setError('');
    setDetail(null);
    setCategories([]);
    setLoading(true);

    try {
      const categoryResponse = await request.get({
        entity: 'costcategory/list',
      });

      if (!categoryResponse?.success) {
        throw new Error(
          categoryResponse?.message || 'Kategori gagal dimuat.'
        );
      }

      setCategories(categoryResponse.result || []);

      if (nextMode === 'detail' && draft) {
        const response = await request.get({
          entity: `projectbudget/read/${draft._id}`,
        });

        if (!response?.success) {
          throw new Error(
            response?.message || 'Detail anggaran gagal dimuat.'
          );
        }

        setDetail(response.result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createBudget(values) {
    setSaving(true);
    setError('');

    try {
      const lines = values.lines || [];

      if (!lines.length) {
        throw new Error('Tambahkan minimal satu rincian biaya.');
      }

      const response = await request.post({
        entity: 'projectbudget/create',
        jsonData: {
          project: projectId,
          lines: lines.map((line) => ({
            category: line.category,
            description: line.description.trim(),
            quantity: line.quantity,
            unit: line.unit.trim(),
            unitCost: line.unitCost,
          })),
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Draft anggaran gagal dibuat.'
        );
      }

      message.success('Draft anggaran berhasil dibuat.');
      setMode('');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function establishBudget() {
    if (!detail) return;

    setSaving(true);
    setError('');

    try {
      const response = await request.post({
        entity: `projectbudget/establish/${detail._id}`,
        jsonData: {},
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Anggaran gagal ditetapkan.'
        );
      }

      message.success('Anggaran awal berhasil ditetapkan.');
      setMode('');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function categoryName(value) {
    const categoryId = value?._id || value;
    const category = categories.find(
      (item) => String(item._id) === String(categoryId)
    );

    return category
      ? `${category.code} — ${category.name}`
      : String(categoryId);
  }

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          disabled={budgets.length > 0}
          onClick={() => openForm('create')}
        >
          Buat Draft Anggaran
        </Button>

        <Button
          disabled={!draft}
          onClick={() => openForm('detail')}
        >
          Periksa dan Tetapkan Draft
        </Button>
      </Space>

      {mode && (
        <Modal
          open
          title={
            mode === 'create'
              ? 'Buat Draft Anggaran'
              : 'Periksa Anggaran Awal'
          }
          width={850}
          footer={null}
          closable={!saving && !loading}
          maskClosable={!saving && !loading}
          onCancel={() => setMode('')}
        >
          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginBottom: 16 }}
            />
          )}

          {loading && (
            <Typography.Paragraph>
              Memuat data…
            </Typography.Paragraph>
          )}

          {mode === 'create' && !loading && (
            <Form
              layout="vertical"
              onFinish={createBudget}
              initialValues={{
                lines: [{ quantity: 1, unitCost: 0 }],
              }}
              disabled={saving || categories.length === 0}
            >
              <Typography.Paragraph>
                Mata uang mengikuti kontrak proyek.
                Total dihitung dari jumlah × biaya satuan.
              </Typography.Paragraph>

              {categories.length === 0 && !error && (
                <Alert
                  type="info"
                  message="Kategori biaya belum tersedia."
                  description="Owner perlu menambahkan kategori melalui Master Data."
                  style={{ marginBottom: 16 }}
                />
              )}

              <Form.List name="lines">
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
                          Rincian {name + 1}
                        </Typography.Title>

                        <Form.Item
                          name={[name, 'category']}
                          label="Kategori biaya"
                          rules={required}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={categories.map((category) => ({
                              value: category._id,
                              label:
                                `${category.code} — ${category.name}`,
                            }))}
                          />
                        </Form.Item>

                        <Form.Item
                          name={[name, 'description']}
                          label="Keterangan biaya"
                          rules={[
                            ...required,
                            {
                              whitespace: true,
                              message: 'Keterangan wajib diisi.',
                            },
                          ]}
                        >
                          <Input maxLength={500} />
                        </Form.Item>

                        <Form.Item
                          name={[name, 'quantity']}
                          label="Jumlah"
                          rules={[
                            ...required,
                            {
                              type: 'number',
                              min: 0.001,
                              message: 'Jumlah harus lebih dari nol.',
                            },
                          ]}
                        >
                          <InputNumber
                            min={0.001}
                            precision={3}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>

                        <Form.Item
                          name={[name, 'unit']}
                          label="Satuan"
                          rules={[
                            ...required,
                            {
                              whitespace: true,
                              message: 'Satuan wajib diisi.',
                            },
                          ]}
                        >
                          <Input
                            maxLength={50}
                            placeholder="Contoh: jam atau kegiatan"
                          />
                        </Form.Item>

                        <Form.Item
                          name={[name, 'unitCost']}
                          label="Biaya satuan"
                          rules={[
                            ...required,
                            {
                              type: 'number',
                              min: 0,
                              message: 'Biaya tidak boleh negatif.',
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
                          Hapus Rincian
                        </Button>
                      </div>
                    ))}

                    <Button
                      block
                      type="dashed"
                      disabled={fields.length >= 200}
                      onClick={() =>
                        add({ quantity: 1, unitCost: 0 })
                      }
                      style={{ marginBottom: 16 }}
                    >
                      Tambah Rincian
                    </Button>
                  </>
                )}
              </Form.List>

              <Form.Item shouldUpdate noStyle>
                {({ getFieldValue }) => {
                  const lines = getFieldValue('lines') || [];

                  const total = lines.reduce(
                    (sum, line) =>
                      sum.add(
                        currency(line?.unitCost || 0)
                          .multiply(line?.quantity || 0)
                      ),
                    currency(0)
                  ).value;

                  return (
                    <Typography.Paragraph>
                      Total sementara:{' '}
                      <strong>
                        {total.toLocaleString('id-ID')}
                      </strong>
                    </Typography.Paragraph>
                  );
                }}
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Simpan Draft Anggaran
              </Button>
            </Form>
          )}

          {mode === 'detail' && detail && !loading && (
            <>
              <Typography.Paragraph>
                Versi: <strong>{detail.version}</strong>
                {' — '}Status:{' '}
                <strong>{detail.approvalStatus}</strong>
              </Typography.Paragraph>

              <Table
                size="small"
                rowKey={(_, index) => String(index)}
                dataSource={detail.lines || []}
                pagination={false}
                scroll={{ x: true }}
                columns={[
                  {
                    title: 'Kategori',
                    dataIndex: 'category',
                    render: categoryName,
                  },
                  {
                    title: 'Keterangan',
                    dataIndex: 'description',
                  },
                  { title: 'Jumlah', dataIndex: 'quantity' },
                  { title: 'Satuan', dataIndex: 'unit' },
                  {
                    title: 'Biaya satuan',
                    dataIndex: 'unitCost',
                    render: (v) =>
                      Number(v).toLocaleString('id-ID'),
                  },
                  {
                    title: 'Subtotal',
                    dataIndex: 'amount',
                    render: (v) =>
                      Number(v).toLocaleString('id-ID'),
                  },
                ]}
              />

              <Typography.Paragraph style={{ marginTop: 16 }}>
                Total:{' '}
                <strong>
                  {detail.currency}{' '}
                  {Number(detail.total).toLocaleString('id-ID')}
                </strong>
              </Typography.Paragraph>

              <Typography.Paragraph>
                Periksa seluruh rincian sebelum menetapkan
                anggaran sebagai anggaran awal yang berlaku.
              </Typography.Paragraph>

              <Button
                type="primary"
                loading={saving}
                disabled={
                  detail.version !== 1 ||
                  detail.approvalStatus !== 'draft' ||
                  detail.isCurrent
                }
                onClick={establishBudget}
              >
                Tetapkan Anggaran Awal
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}