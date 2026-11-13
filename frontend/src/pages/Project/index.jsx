import { useEffect, useState } from 'react';
import { Alert, Button, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

import { useNavigate } from 'react-router-dom';

import { request } from '@/request';

export default function Project() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      setLoading(true);
      setError('');

      try {
        const response = await request.list({
          entity: 'project',
          options: { page: 1, limit: 100 },
        });

        if (!active) return;

        if (response?.success && Array.isArray(response.result)) {
          setProjects(response.result);
        } else {
          setProjects([]);
          setError(
            response?.message || 'Daftar proyek gagal dimuat.'
          );
        }
      } catch {
        if (active) {
          setProjects([]);
          setError('Daftar proyek gagal dimuat.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProjects();

    return () => {
      active = false;
    };
  }, [reload]);

  const columns = [
    {
      title: 'Kode',
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: 'Nama proyek',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Tanggal mulai',
      dataIndex: 'startDate',
      key: 'startDate',
      render: (value) =>
        value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Tanggal selesai',
      dataIndex: 'endDate',
      key: 'endDate',
      render: (value) =>
        value ? dayjs(value).format('DD/MM/YYYY') : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value) => <Tag>{value || '-'}</Tag>,
    },
    {
      title: 'Aksi',
      key: 'action',
      render: (_, row) => (
        <Button
          type="link"
          onClick={() => navigate(`/project/read/${row._id}`)}
        >
          Lihat detail
        </Button>
      ),
    },
  ];


  return (
    <div>
      <Typography.Title level={2}>Daftar Proyek</Typography.Title>

      <Button
        onClick={() => setReload((value) => value + 1)}
        style={{ marginBottom: 16 }}
      >
        Muat ulang
      </Button>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="_id"
        columns={columns}
        dataSource={projects}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );
}