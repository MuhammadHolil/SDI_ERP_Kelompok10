import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

const money = (amount, currency) =>
  `${currency || '-'} ${Number(amount || 0).toLocaleString('id-ID')}`;

export default function InvoiceMilestoneBilling() {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await request.get({
          entity: `billing/milestones?page=${page}&limit=20`,
        });

        if (!active) return;

        if (!response?.success) {
          setError(response?.message || 'Daftar gagal dimuat.');
          return;
        }

        setRows(response.result || []);
        setTotal(response.pagination?.total || 0);
      } catch {
        if (active) setError('Daftar gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [page, reload]);

  function openForm(row) {
    form.resetFields();
    setSelected(row);
  }

  async function issue(values) {
    if (!selected) return;

    setSaving(true);

    try {
      const response = await request.post({
        entity: `billing/invoice/${selected._id}`,
        jsonData: {
          expectedVersion: selected.__v,
          number: values.number,
          date: values.date,
          expiredDate: values.expiredDate,
          contractConditionsMet: values.contractConditionsMet,
          clearanceReference: values.clearanceReference.trim(),
        },
      });

      if (!response?.success) {
        message.error(
          response?.message || 'Invoice gagal diterbitkan.'
        );
        return;
      }

      message.success(response.message);
      setSelected(null);
      setReload((value) => value + 1);
    } catch {
      message.error('Invoice gagal diterbitkan.');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      title: 'Proyek',
      render: (_, row) => row.project?.code || '-',
    },
    {
      title: 'Kontrak / Pelanggan',
      render: (_, row) => (
        <>
          <div>{row.project?.contract?.code || '-'}</div>
          <div>{row.project?.contract?.client?.name || '-'}</div>
        </>
      ),
    },
    {
      title: 'Milestone',
      render: (_, row) => `${row.code} — ${row.name}`,
    },
    {
      title: 'Termin',
      dataIndex: 'billingTermCode',
    },
    {
      title: 'Nilai',
      render: (_, row) =>
        money(
          row.billingAmount,
          row.project?.contract?.currency
        ),
    },
    {
      title: 'Verifikasi',
      dataIndex: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Tindakan',
      render: (_, row) =>
       row.billingInvoice ? (
          <Space>
            <Button
              onClick={() =>
                navigate(`/invoice/read/${row.billingInvoice}`)
              }
            >
              Lihat Invoice
            </Button>

            <Button
              type="primary"
              onClick={() =>
                navigate(
                  `/invoice/milestone-payment/${row.billingInvoice}`
                )
              }
            >
              Pembayaran
            </Button>
          </Space>
        ) : (
          <Button
            type="primary"
            disabled={
              row.status !== 'completed' ||
              row.approvalStatus !== 'approved'
            }
            onClick={() => openForm(row)}
          >
            Terbitkan Invoice
          </Button>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Penagihan Milestone
      </Typography.Title>

      <Alert
        showIcon
        type="info"
        message="Finance memeriksa persyaratan penagihan dalam kontrak."
        description="Pastikan bukti pekerjaan serta persetujuan pelanggan tersedia apabila diwajibkan kontrak. Catat referensi dokumen pemeriksaannya. Invoice tahap ini menggunakan pajak dan diskon nol."
        style={{ marginBottom: 16 }}
      />

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => navigate('/invoice')}>
          Daftar Invoice
        </Button>
        <Button onClick={() => setReload((value) => value + 1)}>
          Muat Ulang
        </Button>
      </Space>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="_id"
        loading={loading}
        dataSource={rows}
        columns={columns}
        scroll={{ x: 1000 }}
        pagination={{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <Modal
        title={`Terbitkan Invoice — ${selected?.code || ''}`}
        open={Boolean(selected)}
        footer={null}
        closable={!saving}
        maskClosable={!saving}
        onCancel={() => {
          if (!saving) setSelected(null);
        }}
      >
        <Typography.Paragraph>
          Nilai invoice:{' '}
          <strong>
            {money(
              selected?.billingAmount,
              selected?.project?.contract?.currency
            )}
          </strong>
        </Typography.Paragraph>

        <Form
          form={form}
          layout="vertical"
          disabled={saving}
          onFinish={issue}
        >
          <Form.Item
            name="number"
            label="Nomor invoice"
            rules={[{ required: true, message: 'Isi nomor invoice.' }]}
          >
            <InputNumber
              min={1}
              max={1000000000}
              precision={0}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="date"
            label="Tanggal invoice"
            rules={[{ required: true }]}
          >
            <Input type="date" />
          </Form.Item>

          <Form.Item
            name="expiredDate"
            label="Tanggal jatuh tempo"
            dependencies={['date']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const date = getFieldValue('date');

                  if (!value || !date || value >= date) {
                    return Promise.resolve();
                  }

                  return Promise.reject(
                    new Error('Jatuh tempo tidak boleh sebelum tanggal invoice.')
                  );
                },
              }),
            ]}
          >
            <Input type="date" />
          </Form.Item>

          <Form.Item
            name="clearanceReference"
            label="Referensi pemeriksaan syarat kontrak"
            rules={[
              {
                required: true,
                whitespace: true,
                message: 'Isi referensi dokumen pemeriksaan.',
              },
            ]}
          >
            <Input.TextArea
              rows={3}
              maxLength={300}
              showCount
            />
          </Form.Item>

          <Form.Item
            name="contractConditionsMet"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value) =>
                  value === true
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error('Konfirmasi pemenuhan syarat kontrak.')
                      ),
              },
            ]}
          >
            <Checkbox>
              Syarat penagihan kontrak sudah diperiksa dan dipenuhi,
              termasuk persetujuan pelanggan bila diwajibkan.
            </Checkbox>
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
          >
            Terbitkan Invoice
          </Button>
        </Form>
      </Modal>
    </div>
  );
}