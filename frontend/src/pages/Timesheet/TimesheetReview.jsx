import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Modal,
  Popconfirm,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';

import { request } from '@/request';

export default function TimesheetReview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');

    try {
      const response = await request.list({
        entity: 'timesheet',
        options: {
          approvalStatus: 'submitted',
          limit: 100,
        },
      });

      if (response?.success && Array.isArray(response.result)) {
        setRows(response.result);
      } else {
        setRows([]);
        setError(
          response?.message || 'Pengajuan timesheet gagal dimuat.'
        );
      }
    } catch {
      setRows([]);
      setError('Pengajuan timesheet gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function decide(row, decision, notes) {
    setError('');
    setReviewingId(row._id);

    try {
      const response = await request.post({
        entity: `timesheet/review/${row._id}`,
        jsonData: {
          expectedRevision: row.revision,
          decision,
          notes,
        },
      });

      if (!response?.success) {
        setError(
          response?.message || 'Keputusan timesheet gagal disimpan.'
        );
        return false;
      }

      await refresh();
      return true;
    } catch {
      setError('Keputusan timesheet gagal disimpan.');
      return false;
    } finally {
      setReviewingId(null);
    }
  }

  async function confirmReject() {
    const notes = rejectNotes.trim();

    if (!notes) {
      setError('Penolakan wajib disertai catatan.');
      return;
    }

    const saved = await decide(rejectTarget, 'rejected', notes);

    if (saved) {
      setRejectTarget(null);
      setRejectNotes('');
    }
  }

  const columns = [
    {
      title: 'Proyek',
      key: 'project',
      render: (_, row) =>
        row.allocation?.project?.code || '-',
    },
    {
      title: 'Tenaga ahli',
      key: 'expert',
      render: (_, row) =>
        row.allocation?.expert?.name || '-',
    },
    {
      title: 'Aktivitas',
      dataIndex: 'activity',
      key: 'activity',
    },
    {
      title: 'Mulai',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value) =>
        value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Jam',
      dataIndex: 'workHours',
      key: 'workHours',
    },
    {
      title: 'Tarif per jam',
      key: 'rate',
      render: (_, row) =>
        new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: row.currency || 'IDR',
          maximumFractionDigits: 2,
        }).format(row.hourlyCostSnapshot),
    },
    {
      title: 'Revisi',
      dataIndex: 'revision',
      key: 'revision',
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Keputusan',
      key: 'actions',
      render: (_, row) => (
        <>
          <Popconfirm
            title="Setujui timesheet ini?"
            description="Jam kerja yang disetujui akan masuk biaya proyek."
            onConfirm={() => decide(row, 'approved', '')}
            okText="Setujui"
            cancelText="Batal"
          >
            <Button
              type="primary"
              loading={reviewingId === row._id}
              style={{ marginRight: 8 }}
            >
              Setujui
            </Button>
          </Popconfirm>

          <Button
            danger
            disabled={Boolean(reviewingId)}
            onClick={() => {
              setError('');
              setRejectNotes('');
              setRejectTarget(row);
            }}
          >
            Tolak
          </Button>
        </>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Pemeriksaan Timesheet
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Button onClick={refresh} style={{ marginBottom: 16 }}>
        Muat ulang
      </Button>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1100 }}
      />

      <Modal
        title="Tolak timesheet"
        open={Boolean(rejectTarget)}
        okText="Simpan penolakan"
        okButtonProps={{ danger: true }}
        confirmLoading={reviewingId === rejectTarget?._id}
        onOk={confirmReject}
        onCancel={() => {
          setRejectTarget(null);
          setRejectNotes('');
        }}
      >
        <p>Tuliskan alasan yang dapat dibaca tenaga ahli.</p>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          value={rejectNotes}
          onChange={(event) =>
            setRejectNotes(event.target.value)
          }
        />
      </Modal>
    </div>
  );
}