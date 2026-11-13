import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';

import { request } from '@/request';

export default function Timesheet() {
  const [form] = Form.useForm();
  const [allocations, setAllocations] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');

    try {
      const [allocationResponse, timesheetResponse] =
        await Promise.all([
          request.list({
            entity: 'allocation',
            options: { limit: 100 },
          }),
          request.list({
            entity: 'timesheet',
            options: { limit: 100 },
          }),
        ]);

      if (
        !allocationResponse?.success ||
        !timesheetResponse?.success
      ) {
        setError(
          allocationResponse?.message ||
          timesheetResponse?.message ||
          'Data timesheet gagal dimuat.'
        );
        return;
      }

      setAllocations(allocationResponse.result || []);
      setTimesheets(timesheetResponse.result || []);
    } catch {
      setError('Data timesheet gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function createTimesheet(values) {
    setError('');
    const startedAt = values.startedAt.startOf('minute');
    const endedAt = values.endedAt.startOf('minute');
    const breakMinutes = values.breakMinutes || 0;

    if (!endedAt.isAfter(startedAt)) {
    setError('Waktu selesai harus setelah waktu mulai.');
    return;
    }

    if (breakMinutes >= endedAt.diff(startedAt, 'minute')) {
    setError('Istirahat harus kurang dari durasi kerja.');
    return;
    }

    setSaving(true);

    try {
      const response = await request.post({
        entity: 'timesheet/create',
        jsonData: {
          allocation: values.allocation,
          activity: values.activity,
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          breakMinutes,
        },
      });

      if (!response?.success) {
        setError(response?.message || 'Timesheet gagal dibuat.');
        return;
      }

      form.resetFields();
      await refresh();
    } catch {
      setError('Timesheet gagal dibuat.');
    } finally {
      setSaving(false);
    }
  }

  async function submitTimesheet(id) {
    setError('');
    setSubmittingId(id);

    try {
      const response = await request.post({
        entity: `timesheet/submit/${id}`,
        jsonData: {},
      });

      if (!response?.success) {
        setError(response?.message || 'Timesheet gagal diajukan.');
        return;
      }

      await refresh();
    } catch {
      setError('Timesheet gagal diajukan.');
    } finally {
      setSubmittingId(null);
    }
  }

  const allocationOptions = allocations
    .filter((item) => ['planned', 'active'].includes(item.status))
    .map((item) => ({
      value: item._id,
      label: `${item.project?.code || 'Proyek'} — ${item.projectRole}`,
    }));

  const columns = [
    {
      title: 'Aktivitas',
      dataIndex: 'activity',
      key: 'activity',
    },
    {
      title: 'Proyek',
      key: 'project',
      render: (_, row) =>
        row.allocation?.project?.code || '-',
    },
    {
      title: 'Mulai',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value) =>
        value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Selesai',
      dataIndex: 'endedAt',
      key: 'endedAt',
      render: (value) =>
        value ? dayjs(value).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Jam kerja',
      dataIndex: 'workHours',
      key: 'workHours',
    },
    {
      title: 'Status',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Tindakan',
      key: 'action',
      render: (_, row) =>
        row.approvalStatus === 'draft' ? (
          <Button
            type="primary"
            loading={submittingId === row._id}
            onClick={() => submitTimesheet(row._id)}
          >
            Ajukan
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <Typography.Title level={2}>
        Timesheet Tenaga Ahli
      </Typography.Title>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Typography.Title level={4}>
        Catat Jam Kerja
      </Typography.Title>

      <Form
        form={form}
        layout="vertical"
        onFinish={createTimesheet}
        initialValues={{ breakMinutes: 0 }}
      >
        <Form.Item
          name="allocation"
          label="Alokasi proyek"
          rules={[{ required: true, message: 'Pilih alokasi.' }]}
        >
          <Select options={allocationOptions} />
        </Form.Item>

        <Form.Item
          name="activity"
          label="Aktivitas"
          rules={[{ required: true, message: 'Isi aktivitas.' }]}
        >
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>

        <Form.Item
          name="startedAt"
          label="Mulai bekerja"
          rules={[{ required: true, message: 'Isi waktu mulai.' }]}
        >
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="DD/MM/YYYY HH:mm"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="endedAt"
          label="Selesai bekerja"
          rules={[{ required: true, message: 'Isi waktu selesai.' }]}
        >
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="DD/MM/YYYY HH:mm"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="breakMinutes"
          label="Istirahat (menit)"
          rules={[{ required: true }]}
        >
          <InputNumber min={0} precision={0} />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={saving}>
          Simpan Draft
        </Button>
      </Form>

      <Typography.Title level={4} style={{ marginTop: 32 }}>
        Daftar Timesheet
      </Typography.Title>

      <Button onClick={refresh} style={{ marginBottom: 16 }}>
        Muat ulang
      </Button>

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={timesheets}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}