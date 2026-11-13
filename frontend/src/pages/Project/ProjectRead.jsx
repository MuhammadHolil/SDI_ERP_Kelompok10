import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Descriptions,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';

import { request } from '@/request';

const formatDate = (value) =>
  value ? dayjs(value).format('DD/MM/YYYY') : '-';

const formatMoney = (value, currency = 'IDR') =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function ProjectRead() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [cost, setCost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadDetail() {
      setLoading(true);
      setError('');
      setProject(null);
      setBudgets([]);
      setMilestones([]);
      setCost(null);

      try {
        const projectResponse = await request.get({
          entity: `project/read/${id}`,
        });

        if (!active) return;

        if (!projectResponse?.success) {
          setError(
            projectResponse?.message || 'Proyek gagal dibaca.'
          );
          return;
        }

        setProject(projectResponse.result);

        const [
          budgetResponse,
          milestoneResponse,
          costResponse,
        ] = await Promise.all([
          request.list({
            entity: 'projectbudget',
            options: { project: id, limit: 100 },
          }),
          request.get({
            entity: `milestone/list/${id}`,
          }),
          request.get({
            entity: `project/actual-cost/${id}`,
          }),
        ]);

        if (!active) return;

        if (
          !budgetResponse?.success ||
          !milestoneResponse?.success ||
          !costResponse?.success
        ) {
          setError(
            budgetResponse?.message ||
            milestoneResponse?.message ||
            costResponse?.message ||
            'Sebagian data proyek gagal dimuat.'
          );
          return;
        }

        setBudgets(budgetResponse.result || []);
        setMilestones(milestoneResponse.result || []);
        setCost(costResponse.result);
      } catch {
        if (active) {
          setError('Detail proyek gagal dimuat.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDetail();

    return () => {
      active = false;
    };
  }, [id]);

  const budgetColumns = [
    { title: 'Versi', dataIndex: 'version', key: 'version' },
    {
      title: 'Total',
      key: 'total',
      render: (_, row) => formatMoney(row.total, row.currency),
    },
    {
      title: 'Persetujuan',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      render: (value) => <Tag>{value}</Tag>,
    },
    {
      title: 'Anggaran berlaku',
      dataIndex: 'isCurrent',
      key: 'isCurrent',
      render: (value) => (value ? 'Ya' : 'Tidak'),
    },
  ];

  const milestoneColumns = [
    { title: 'Kode', dataIndex: 'code', key: 'code' },
    { title: 'Milestone', dataIndex: 'name', key: 'name' },
    {
      title: 'Target',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: formatDate,
    },
    {
      title: 'Bobot',
      dataIndex: 'progressWeight',
      key: 'progressWeight',
      render: (value) => `${value}%`,
    },
    {
      title: 'Termin',
      dataIndex: 'billingTermCode',
      key: 'billingTermCode',
    },
    {
      title: 'Nilai termin',
      dataIndex: 'billingAmount',
      key: 'billingAmount',
      render: (value) => formatMoney(value, cost?.currency),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value) => <Tag>{value}</Tag>,
    },
  ];

  return (
    <div>
      <Button
        onClick={() => navigate('/project')}
        style={{ marginBottom: 16 }}
      >
        Kembali ke daftar proyek
      </Button>

      {loading && <Spin />}

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && project && (
        <>
          <Typography.Title level={2}>
            {project.code} — {project.name}
          </Typography.Title>

          <Descriptions bordered column={1}>
            <Descriptions.Item label="Status">
              {project.status}
            </Descriptions.Item>
            <Descriptions.Item label="Mulai">
              {formatDate(project.startDate)}
            </Descriptions.Item>
            <Descriptions.Item label="Selesai">
              {formatDate(project.endDate)}
            </Descriptions.Item>
            <Descriptions.Item label="ID kontrak">
              {project.contract}
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Anggaran
          </Typography.Title>
          <Table
            rowKey="_id"
            columns={budgetColumns}
            dataSource={budgets}
            pagination={false}
          />

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Milestone
          </Typography.Title>
          <Table
            rowKey="_id"
            columns={milestoneColumns}
            dataSource={milestones}
            pagination={false}
          />

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Biaya aktual
          </Typography.Title>
          {cost && (
            <Descriptions bordered column={1}>
              <Descriptions.Item label="Jam disetujui">
                {cost.approvedHours}
              </Descriptions.Item>
              <Descriptions.Item label="Biaya tenaga kerja">
                {formatMoney(cost.laborCost, cost.currency)}
              </Descriptions.Item>
              <Descriptions.Item label="Biaya pengeluaran">
                {formatMoney(cost.expenseCost, cost.currency)}
              </Descriptions.Item>
              <Descriptions.Item label="Total biaya aktual">
                {formatMoney(cost.totalActualCost, cost.currency)}
              </Descriptions.Item>
            </Descriptions>
          )}
        </>
      )}
    </div>
  );
}