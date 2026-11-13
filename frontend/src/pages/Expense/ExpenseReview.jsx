import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, Space, Table, Tag } from 'antd';
import axios from 'axios';

import { request } from '@/request';
import storePersist from '@/redux/storePersist';
import { API_BASE_URL } from '@/config/serverApiConfig';

export default function ExpenseReview() {
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [notes, setNotes] = useState('');

  async function loadData() {
    setError('');

    const response = await request.list({
      entity: 'expense',
      options: { approvalStatus: 'submitted', limit: 100 },
    });

    if (!response.success) {
      setError(response.message || 'Pengajuan pengeluaran gagal dimuat.');
      return;
    }

    setExpenses(response.result || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function downloadEvidence(expense, evidence) {
    setError('');

    try {
      const auth = storePersist.get('auth');
      const token = auth?.current?.token;

      const response = await axios.get(
        `${API_BASE_URL}expense/evidence/${expense._id}/${evidence.fileId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = evidence.originalName || `bukti-${evidence.fileId}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.response?.data?.message || 'Bukti gagal diunduh.');
    }
  }

  async function decide(expense, decision, decisionNotes) {
    if (decision === 'rejected' && !decisionNotes.trim()) {
      setError('Penolakan wajib disertai catatan.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const response = await request.post({
        entity: `expense/review/${expense._id}`,
        jsonData: {
          expectedRevision: expense.revision,
          decision,
          notes: decisionNotes.trim(),
        },
      });

      if (!response.success) {
        setError(response.message || 'Keputusan gagal disimpan.');
        return;
      }

      setRejecting(null);
      setNotes('');
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    {
      title: 'Proyek',
      render: (_, row) => row.project?.code || '-',
    },
    {
      title: 'Pengaju',
      render: (_, row) => row.createdBy?.name || '-',
    },
    { title: 'Uraian', dataIndex: 'description' },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      render: (amount) => `Rp ${Number(amount).toLocaleString('id-ID')}`,
    },
    { title: 'Revisi', dataIndex: 'revision' },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Bukti',
      render: (_, row) =>
        (row.evidence || []).map((item) => (
          <Button
            key={item.fileId}
            type="link"
            onClick={() => downloadEvidence(row, item)}
          >
            {item.originalName || 'Unduh bukti'}
          </Button>
        )),
    },
    {
      title: 'Keputusan',
      render: (_, row) => (
        <Space>
          <Button
            type="primary"
            disabled={busy}
            onClick={() => decide(row, 'approved', 'Bukti dan nominal telah diperiksa.')}
          >
            Setujui
          </Button>
          <Button danger disabled={busy} onClick={() => setRejecting(row)}>
            Tolak
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h1>Periksa Pengeluaran</h1>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Button onClick={loadData} style={{ marginBottom: 16 }}>
        Muat ulang
      </Button>

      <Table
        rowKey="_id"
        dataSource={expenses}
        columns={columns}
        scroll={{ x: 1100 }}
      />

      <Modal
        title="Tolak pengeluaran"
        open={Boolean(rejecting)}
        confirmLoading={busy}
        onCancel={() => {
          setRejecting(null);
          setNotes('');
        }}
        onOk={() => {
          if (rejecting) decide(rejecting, 'rejected', notes);
        }}
        okText="Simpan penolakan"
      >
        <p>Jelaskan alasan penolakan:</p>
        <Input.TextArea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Modal>
    </div>
  );
}