import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Table,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

const money = (value, currency) =>
  `${currency || '-'} ${Number(value || 0).toLocaleString('id-ID', {
    maximumFractionDigits: 2,
  })}`;

function validateAmount(value, remaining) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 'Nominal harus berupa angka lebih dari nol.';
  }

  const amountMinor = Math.round(value * 100);

  if (
    !Number.isSafeInteger(amountMinor) ||
    Math.abs(amountMinor / 100 - value) > 1e-8
  ) {
    return 'Nominal maksimal dua angka desimal.';
  }

  if (
    typeof remaining !== 'number' ||
    !Number.isFinite(remaining) ||
    remaining < 0
  ) {
    return 'Saldo invoice belum valid. Muat ulang halaman.';
  }

  if (amountMinor > Math.round(remaining * 100)) {
    return 'Pembayaran melebihi sisa piutang.';
  }

  return '';
}

export default function InvoiceMilestonePayment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form] = Form.useForm();
  const [reverseForm] = Form.useForm();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  const [requestKey, setRequestKey] = useState(
    () => crypto.randomUUID()
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      setData(null);

      try {
        const response = await request.get({
          entity: `billing/payments/${id}`,
        });

        if (!active) return;

        if (!response?.success) {
          setError(
            response?.message || 'Pembayaran gagal dimuat.'
          );
          return;
        }

        setData(response.result);
      } catch {
        if (active) {
          setError('Pembayaran gagal dimuat.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [id, reload]);

  async function save(values) {
    if (saving || reversing) return;

    setSaving(true);

    try {
      const response = await request.post({
        entity: `billing/payments/${id}`,
        jsonData: {
          number: values.number,
          amount: values.amount,
          date: values.date,
          ref: values.ref.trim(),
          description: values.description?.trim() || '',
          idempotencyKey: requestKey,
        },
      });

      if (!response?.success) {
        message.error(
          response?.message || 'Pembayaran gagal dicatat.'
        );
        return;
      }

      message.success(response.message);
      form.resetFields();
      setRequestKey(crypto.randomUUID());
      setReload((value) => value + 1);
    } catch {
      message.error(
        'Hasil permintaan belum diketahui. Periksa riwayat sebelum mencoba lagi.'
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmPayment(values) {
    if (!data?.invoice || saving || reversing || loading) {
      return;
    }

    const validationError = validateAmount(
      values.amount,
      data.remaining
    );

    if (validationError) {
      message.error(validationError);
      return;
    }

    const remainingAfter =
      (
        Math.round(data.remaining * 100) -
        Math.round(values.amount * 100)
      ) / 100;

    Modal.confirm({
      title: 'Konfirmasi pembayaran',
      content: (
        <div>
          <p>
            Invoice: {data.invoice.number}/{data.invoice.year}
          </p>
          <p>
            Piutang sebelum pembayaran:{' '}
            {money(data.remaining, data.invoice.currency)}
          </p>
          <p>
            <strong>
              Nominal yang dicatat:{' '}
              {money(values.amount, data.invoice.currency)}
            </strong>
          </p>
          <p>
            Piutang setelah pembayaran:{' '}
            {money(remainingAfter, data.invoice.currency)}
          </p>
          <p>Pastikan nominal dan referensi bukti sudah benar.</p>
        </div>
      ),
      okText: 'Ya, Catat Pembayaran',
      cancelText: 'Periksa Kembali',
      maskClosable: false,
      onOk: () => save(values),
    });
  }

  async function reversePayment(values) {
    if (!reverseTarget || reversing || saving) return;

    setReversing(true);

    try {
      const response = await request.post({
        entity: `billing/payment/${reverseTarget._id}/reverse`,
        jsonData: {
          reason: values.reason.trim(),
          reference: values.reference.trim(),
        },
      });

      if (!response?.success) {
        message.error(
          response?.message || 'Pembatalan gagal diproses.'
        );
        return;
      }

      message.success(response.message);
      setReverseTarget(null);
      reverseForm.resetFields();
      form.resetFields();
      setRequestKey(crypto.randomUUID());
      setReload((value) => value + 1);
    } catch {
      message.error(
        'Hasil pembatalan belum diketahui. Muat ulang riwayat sebelum mencoba lagi.'
      );
    } finally {
      setReversing(false);
    }
  }

  const invoice = data?.invoice;
  const busy = saving || reversing;

  const canPay =
    invoice &&
    Number.isFinite(data.remaining) &&
    data.remaining > 0 &&
    ['pending', 'sent'].includes(invoice.status);

  const paymentColumns = [
    {
      title: 'Nomor',
      dataIndex: 'number',
    },
    {
      title: 'Tanggal',
      dataIndex: 'date',
      render: (value) => value?.slice(0, 10),
    },
    {
      title: 'Nominal',
      render: (_, row) => money(row.amount, row.currency),
    },
    {
      title: 'Referensi',
      dataIndex: 'ref',
    },
    {
      title: 'Keterangan',
      dataIndex: 'description',
    },
    {
      title: 'Status catatan',
      render: (_, row) =>
        row.isReversed ? (
          <div>
            <strong>Dibatalkan</strong>
            <div>{row.reversal?.reason}</div>
            <div>
              Referensi: {row.reversal?.reference || '-'}
            </div>
          </div>
        ) : (
          'Berlaku'
        ),
    },
    {
      title: 'Koreksi',
      render: (_, row) =>
        row.isReversed ? (
          '-'
        ) : (
          <Button
            danger
            disabled={busy || loading}
            onClick={() => {
              reverseForm.resetFields();
              setReverseTarget(row);
            }}
          >
            Batalkan Catatan
          </Button>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Pembayaran Invoice Milestone
      </Typography.Title>

      <Button
        disabled={busy}
        style={{ marginBottom: 16 }}
        onClick={() => navigate('/invoice/billing')}
      >
        Kembali ke penagihan
      </Button>

      <Button
        disabled={busy}
        loading={loading}
        style={{ marginLeft: 8 }}
        onClick={() => setReload((value) => value + 1)}
      >
        Muat Ulang
      </Button>

      {error && (
        <Alert type="error" showIcon message={error} />
      )}

      {invoice && (
        <>
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Invoice">
              {invoice.number}/{invoice.year}
            </Descriptions.Item>

            <Descriptions.Item label="Pelanggan">
              {invoice.client?.name || '-'}
            </Descriptions.Item>

            <Descriptions.Item label="Total">
              {money(invoice.total, invoice.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Sudah dibayar">
              {money(invoice.credit, invoice.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Sisa piutang">
              {money(data.remaining, invoice.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Status pembayaran">
              {invoice.paymentStatus}
            </Descriptions.Item>
          </Descriptions>

          {canPay ? (
            <Form
              form={form}
              layout="vertical"
              onFinish={confirmPayment}
              disabled={busy || loading}
              style={{ marginTop: 24 }}
            >
              <Form.Item
                name="number"
                label="Nomor catatan pembayaran"
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={1}
                  max={1000000000}
                  precision={0}
                />
              </Form.Item>

              <Form.Item
                name="date"
                label="Tanggal pembayaran"
                rules={[{ required: true }]}
              >
                <Input
                  type="date"
                  min={invoice.date?.slice(0, 10)}
                />
              </Form.Item>

              <Form.Item
                name="amount"
                label={`Nominal pembayaran (${invoice.currency})`}
                extra={`Sisa piutang: ${money(
                  data.remaining,
                  invoice.currency
                )}`}
                rules={[
                  {
                    required: true,
                    message: 'Nominal pembayaran wajib diisi.',
                  },
                  {
                    validator: (_, value) => {
                      if (value === null || value === undefined) {
                        return Promise.resolve();
                      }

                      const validationError = validateAmount(
                        value,
                        data.remaining
                      );

                      return validationError
                        ? Promise.reject(new Error(validationError))
                        : Promise.resolve();
                    },
                  },
                ]}
              >
                <InputNumber
                  controls={false}
                  style={{ width: '100%' }}
                  placeholder="Masukkan nominal pembayaran"
                />
              </Form.Item>

              <Form.Item
                name="ref"
                label="Referensi bukti pembayaran"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: 'Referensi pembayaran wajib diisi.',
                  },
                ]}
              >
                <Input maxLength={150} />
              </Form.Item>

              <Form.Item
                name="description"
                label="Keterangan"
              >
                <Input.TextArea maxLength={1000} />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Catat Pembayaran
              </Button>
            </Form>
          ) : (
            <Alert
              style={{ marginTop: 16 }}
              type={data.remaining < 0 ? 'warning' : 'info'}
              showIcon
              message={
                data.remaining < 0
                  ? 'Pembayaran melebihi nilai invoice. Periksa transaksi.'
                  : data.remaining === 0
                    ? 'Invoice sudah lunas.'
                    : 'Status atau saldo invoice tidak menerima pembayaran.'
              }
            />
          )}

          <Typography.Title
            level={4}
            style={{ marginTop: 24 }}
          >
            Riwayat Pembayaran
          </Typography.Title>

          <Table
            rowKey="_id"
            dataSource={data.payments || []}
            columns={paymentColumns}
            scroll={{ x: 1000 }}
          />
        </>
      )}

      <Modal
        title="Batalkan Catatan Pembayaran"
        open={Boolean(reverseTarget)}
        footer={null}
        closable={!reversing}
        maskClosable={false}
        keyboard={!reversing}
        onCancel={() => {
          if (!reversing) setReverseTarget(null);
        }}
      >
        <Alert
          type="warning"
          showIcon
          message="Pembayaran asli tetap disimpan dalam riwayat."
          description="Tindakan ini membatalkan pencatatan dan menghitung ulang saldo invoice. Tindakan ini tidak melakukan pengembalian uang melalui bank."
          style={{ marginBottom: 16 }}
        />

        <p>
          Catatan pembayaran:{' '}
          <strong>{reverseTarget?.number}</strong>
        </p>

        <p>
          Nominal:{' '}
          <strong>
            {money(
              reverseTarget?.amount,
              reverseTarget?.currency
            )}
          </strong>
        </p>

        <Form
          form={reverseForm}
          layout="vertical"
          disabled={reversing}
          onFinish={reversePayment}
        >
          <Form.Item
            name="reason"
            label="Alasan pembatalan"
            rules={[
              {
                required: true,
                whitespace: true,
                message: 'Alasan pembatalan wajib diisi.',
              },
            ]}
          >
            <Input.TextArea rows={3} maxLength={1500} />
          </Form.Item>

          <Form.Item
            name="reference"
            label="Referensi dokumen koreksi"
            rules={[
              {
                required: true,
                whitespace: true,
                message: 'Referensi koreksi wajib diisi.',
              },
            ]}
          >
            <Input maxLength={300} />
          </Form.Item>

          <Button
            danger
            type="primary"
            htmlType="submit"
            loading={reversing}
          >
            Batalkan Catatan dan Hitung Ulang Saldo
          </Button>
        </Form>
      </Modal>
    </div>
  );
}