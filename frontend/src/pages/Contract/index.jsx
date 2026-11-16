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

import ContractAgreement from './ContractAgreement';

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
    }).format(Number(value) || 0);
  } catch {
    return `${currency || '-'} ${Number(value) || 0}`;
  }
}

async function loadAcceptedQuotes() {
  const accepted = [];

  for (let page = 1; page <= 1000; page += 1) {
    const response = await request.get({
      entity: `quote/list?page=${page}&limit=100`,
    });

    if (!response?.success) {
      throw new Error(
        response?.message || 'Quotation gagal dimuat.'
      );
    }

    const rows = response.result || [];

    accepted.push(
      ...rows.filter((quote) => quote.status === 'accepted')
    );

    const total =
      response.pagination?.total ?? response.pagination?.count;

    if (
      rows.length < 100 ||
      (typeof total === 'number' && page * 100 >= total)
    ) {
      return accepted;
    }
  }

  throw new Error('Daftar quotation terlalu besar.');
}

export default function Contract() {
  const [form] = Form.useForm();
  const [quotes, setQuotes] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
        const [quoteRows, response] = await Promise.all([
          loadAcceptedQuotes(),
          request.get({
            entity: `contract/list?page=${page}&limit=10`,
          }),
        ]);

        if (!active) return;

        if (!response?.success) {
          throw new Error(
            response?.message || 'Kontrak gagal dimuat.'
          );
        }

        setQuotes(quoteRows);
        setContracts(response.result || []);
        setTotal(response.pagination?.total || 0);
      } catch (err) {
        if (active) {
          setQuotes([]);
          setContracts([]);
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

  async function createContract(values) {
    setSaving(true);
    setError('');

    try {
      // Ambil data terbaru sebelum membuat kontrak.
      const quoteResponse = await request.get({
        entity: `quote/read/${values.quote}`,
      });

      if (!quoteResponse?.success) {
        throw new Error(
          quoteResponse?.message || 'Quotation gagal dibaca.'
        );
      }

      const quote = quoteResponse.result;

      if (quote.status !== 'accepted') {
        throw new Error(
          'Quotation harus berstatus accepted. Muat ulang daftar.'
        );
      }

      if (!/^[A-Z]{3}$/.test(quote.currency || '')) {
        throw new Error(
          'Mata uang quotation belum valid. Perbaiki quotation dahulu.'
        );
      }

      const response = await request.post({
        entity: 'contract/create',
        jsonData: {
          code: values.code.trim(),
          quote: quote._id,
          client: quote.client?._id || quote.client,
          scope: values.scope.trim(),
          contractValue: quote.total,
          currency: quote.currency,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Kontrak gagal dibuat.'
        );
      }

      message.success('Draft kontrak berhasil dibuat.');
      form.resetFields();
      setPage(1);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Typography.Title level={2}>
        Kontrak
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
        Buat Draft Kontrak
      </Typography.Title>

      <Typography.Paragraph>
        Pelanggan, nilai, dan mata uang kontrak mengikuti
        quotation yang dipilih.
      </Typography.Paragraph>

      <Form
        form={form}
        layout="vertical"
        onFinish={createContract}
        disabled={saving || loading}
        style={{ maxWidth: 700 }}
      >
        <Form.Item
          name="code"
          label="Kode kontrak"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Kode kontrak wajib diisi.',
            },
          ]}
        >
          <Input maxLength={100} />
        </Form.Item>

        <Form.Item
          name="quote"
          label="Quotation accepted"
          rules={[
            {
              required: true,
              message: 'Pilih quotation.',
            },
          ]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Pilih quotation yang telah diterima"
            options={quotes.map((quote) => ({
              value: quote._id,
              label:
                `${quote.number}/${quote.year} — ` +
                `${quote.client?.name || 'Pelanggan'} — ` +
                formatMoney(quote.total, quote.currency),
            }))}
          />
        </Form.Item>

        <Form.Item
          name="scope"
          label="Ruang lingkup pekerjaan"
          rules={[
            {
              required: true,
              whitespace: true,
              message: 'Ruang lingkup wajib diisi.',
            },
          ]}
        >
          <Input.TextArea rows={4} maxLength={5000} />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              disabled={!quotes.length}
            >
              Buat Draft Kontrak
            </Button>

            <Button onClick={() => form.resetFields()}>
              Kosongkan
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {!loading && !error && !quotes.length && (
        <Alert
          type="info"
          message="Belum ada quotation accepted."
          description="Buat quotation dan ubah statusnya menjadi accepted melalui menu Quote."
          style={{ marginBottom: 16 }}
        />
      )}

      <Button
        loading={loading}
        disabled={saving}
        onClick={() => setReload((value) => value + 1)}
        style={{ marginBottom: 16 }}
      >
        Muat ulang daftar
      </Button>

      <Table
        rowKey="_id"
        loading={loading}
        dataSource={contracts}
        scroll={{ x: true }}
        columns={[
          { title: 'Kode', dataIndex: 'code' },
          {
            title: 'Pelanggan',
            render: (_, row) => row.client?.name || '-',
          },
          {
            title: 'Nilai kontrak',
            render: (_, row) =>
              formatMoney(row.contractValue, row.currency),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (value) => <Tag>{value}</Tag>,
          },
          {
            title: 'Aksi',
            key: 'action',
            render: (_, row) => (
              <ContractAgreement
                contract={row}
                onSaved={() => setReload((value) => value + 1)}
              />
            ),
          },
        ]}
       expandable={{
        expandedRowRender: (row) => (
      <div>
      <Typography.Paragraph>
        {row.scope}
      </Typography.Paragraph>

      <Typography.Title level={5}>
        Termin Pembayaran
      </Typography.Title>

      <Table
        rowKey="code"
        size="small"
        pagination={false}
        dataSource={row.billingTerms || []}
        columns={[
          {
            title: 'Kode',
            dataIndex: 'code',
          },
          {
            title: 'Nama termin',
            dataIndex: 'name',
          },
          {
            title: 'Nilai',
            dataIndex: 'amount',
            render: (value) =>
              formatMoney(value, row.currency),
          },
          ]}
          />
        </div>
      ),
      }}
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