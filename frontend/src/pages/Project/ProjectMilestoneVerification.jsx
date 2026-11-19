import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Select,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';

import { request } from '@/request';

export default function ProjectMilestoneVerification({
  milestones = [],
  onSaved,
}) {
  const [form] = Form.useForm();
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const decision = Form.useWatch('decision', form);
  const selected = milestones.find((item) => item._id === selectedId);

  const canReview =
    selected &&
    ((selected.status === 'planned' &&
      selected.approvalStatus === 'draft') ||
      (selected.status === 'revision_required' &&
        selected.approvalStatus === 'rejected'));

  useEffect(() => {
    let active = true;

    setHistory([]);
    setHistoryError('');

    if (!selectedId) return;

    async function loadHistory() {
      setHistoryLoading(true);

      try {
        const response = await request.get({
          entity: `milestone/verification-history/${selectedId}`,
        });

        if (!active) return;

        if (!response?.success) {
          setHistoryError(
            response?.message || 'Riwayat gagal dimuat.'
          );
          return;
        }

        setHistory(response.result || []);
      } catch {
        if (active) setHistoryError('Riwayat gagal dimuat.');
      } finally {
        if (active) setHistoryLoading(false);
      }
    }

    loadHistory();

    return () => {
      active = false;
    };
  }, [selectedId]);

  async function save(values) {
    if (!selected || !canReview) return;

    if (!Number.isInteger(selected.__v)) {
      message.error('Versi milestone tidak tersedia. Muat ulang halaman.');
      return;
    }

    setSaving(true);

    try {
      const response = await request.post({
        entity: `milestone/verify/${selected._id}`,
        jsonData: {
          expectedVersion: selected.__v,
          decision: values.decision,
          notes: values.notes.trim(),
          reference: values.reference?.trim() || '',
        },
      });

      if (!response?.success) {
        message.error(
          response?.message || 'Keputusan gagal disimpan.'
        );
        return;
      }

      message.success(response.message);
      form.resetFields();
      setSelectedId(null);
      onSaved?.();
    } catch {
      message.error('Keputusan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="Verifikasi milestone oleh PM"
      style={{ marginTop: 16 }}
    >
      <Alert
        type="info"
        showIcon
        message="Persetujuan ini merupakan verifikasi internal PM."
        description="Referensi bukti dapat berupa nama dokumen atau tautan dokumen hasil pekerjaan. Formulir ini belum mengunggah berkas dan belum menerbitkan invoice."
        style={{ marginBottom: 16 }}
      />

      <Typography.Paragraph>Pilih milestone:</Typography.Paragraph>

      <Select
        placeholder="Pilih milestone yang akan diperiksa"
        value={selectedId}
        disabled={saving}
        style={{ width: '100%', marginBottom: 16 }}
        options={milestones.map((item) => ({
          value: item._id,
          label: `${item.code} — ${item.name} (${item.approvalStatus})`,
        }))}
        onChange={(value) => {
          setSelectedId(value);
          form.resetFields();
        }}
      />

      {selected && (
        <>
          <Typography.Paragraph>
            Status pekerjaan: <Tag>{selected.status}</Tag>
            Status verifikasi: <Tag>{selected.approvalStatus}</Tag>
          </Typography.Paragraph>

          {canReview ? (
            <Form
              form={form}
              layout="vertical"
              onFinish={save}
              disabled={saving}
            >
              <Form.Item
                name="decision"
                label="Keputusan"
                rules={[
                  {
                    required: true,
                    message: 'Pilih keputusan.',
                  },
                ]}
              >
                <Select
                  options={[
                    {
                      value: 'approved',
                      label: 'Setujui hasil pekerjaan',
                    },
                    {
                      value: 'rejected',
                      label: 'Perlu perbaikan',
                    },
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="notes"
                label="Catatan pemeriksaan"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: 'Catatan pemeriksaan wajib diisi.',
                  },
                ]}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={1500}
                  showCount
                />
              </Form.Item>

              <Form.Item
                name="reference"
                label="Referensi bukti hasil pekerjaan"
                rules={[
                  {
                    required: decision === 'approved',
                    whitespace: true,
                    message: 'Persetujuan wajib memiliki referensi bukti.',
                  },
                ]}
              >
                <Input
                  maxLength={300}
                  placeholder="Nama dokumen atau tautan bukti"
                />
              </Form.Item>

              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Simpan Keputusan
              </Button>
            </Form>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Milestone tidak dapat diperiksa ulang pada status sekarang."
            />
          )}

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            Riwayat verifikasi
          </Typography.Title>

          {historyError && (
            <Alert
              type="error"
              message={historyError}
              style={{ marginBottom: 12 }}
            />
          )}

          <Table
            rowKey="_id"
            loading={historyLoading}
            dataSource={history}
            pagination={{ pageSize: 5 }}
            scroll={{ x: 650 }}
            columns={[
              {
                title: 'Versi',
                dataIndex: 'targetRevision',
              },
              {
                title: 'Keputusan',
                dataIndex: 'decision',
              },
              {
                title: 'Pemeriksa',
                render: (_, row) => row.decidedBy?.name || '-',
              },
              {
                title: 'Waktu',
                dataIndex: 'decidedAt',
                render: (value) =>
                  value
                    ? dayjs(value).format('DD/MM/YYYY HH:mm')
                    : '-',
              },
              {
                title: 'Catatan dan referensi',
                dataIndex: 'notes',
                render: (value) => (
                  <span style={{ whiteSpace: 'pre-wrap' }}>
                    {value}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}
    </Card>
  );
}