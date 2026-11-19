import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';

import { request } from '@/request';

const money = (value, currency) =>
  value === null || value === undefined
    ? 'Belum tersedia'
    : `${currency} ${Number(value).toLocaleString('id-ID', {
        maximumFractionDigits: 2,
      })}`;

export default function ProjectDashboard() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        const response = await request.get({
          entity: 'dashboard/projects',
        });

        if (!active) return;

        if (!response?.success) {
          setError(response?.message || 'Daftar proyek gagal dimuat.');
          return;
        }

        setProjects(response.result || []);
      } catch {
        if (active) setError('Daftar proyek gagal dimuat.');
      }
    }

    loadProjects();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    setData(null);

    if (!projectId) return;

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const response = await request.get({
          entity: `dashboard/project/${projectId}`,
        });

        if (!active) return;

        if (!response?.success) {
          setError(response?.message || 'Dashboard gagal dimuat.');
          return;
        }

        setData(response.result);
      } catch {
        if (active) setError('Dashboard gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      active = false;
    };
  }, [projectId, reload]);

  const cards = data
    ? [
        ['Nilai kontrak', data.contractValue],
        ['Anggaran berlaku', data.budget],
        ['Biaya aktual', data.actualCost],
        ['Nilai invoice bersih', data.invoiced],
        ['Pembayaran dari riwayat', data.received],
        ['Saldo piutang', data.receivable],
      ]
    : [];

  return (
    <div>
      <Typography.Title level={2}>
        Dashboard KPI Proyek dan Keuangan
      </Typography.Title>

      <Space wrap style={{ marginBottom: 20 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Pilih proyek"
          value={projectId}
          disabled={loading}
          style={{ width: 420, maxWidth: '100%' }}
          options={projects.map((project) => ({
            value: project._id,
            label: `${project.code} — ${project.name}`,
          }))}
          onChange={setProjectId}
        />

        <Button
          disabled={!projectId}
          loading={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Muat Ulang KPI
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

      {data && (
        <>
          <Typography.Title level={4}>
            {data.project.code} — {data.project.name}
          </Typography.Title>

          {data.warnings.map((warning, index) => (
            <Alert
              key={`${index}-${warning}`}
              type="warning"
              showIcon
              message={warning}
              style={{ marginBottom: 12 }}
            />
          ))}

          <Row gutter={[16, 16]}>
            {cards.map(([title, value]) => (
              <Col xs={24} md={12} xl={8} key={title}>
                <Card title={title}>
                  <Typography.Title level={4}>
                    {money(value, data.currency)}
                  </Typography.Title>
                </Card>
              </Col>
            ))}
          </Row>

          <Card
            title="Progres milestone terverifikasi"
            style={{ marginTop: 20 }}
          >
            <Progress percent={data.progress} />
          </Card>

          <Descriptions
            title="Rincian KPI"
            bordered
            column={1}
            style={{ marginTop: 20 }}
          >
            <Descriptions.Item label="Kontrak">
              {data.contractCode}
            </Descriptions.Item>

            <Descriptions.Item label="Versi anggaran berlaku">
              {data.budgetVersion || 'Belum tersedia'}
            </Descriptions.Item>

            <Descriptions.Item label="Jam kerja disetujui">
              {data.approvedHours} jam
            </Descriptions.Item>

            <Descriptions.Item label="Biaya tenaga ahli">
              {money(data.laborCost, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Pengeluaran disetujui">
              {money(data.expenseCost, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Bagian pengeluaran dengan vendor">
              {money(data.vendorCost, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Pemakaian anggaran">
              {data.budgetUsage === null
                ? 'Belum dapat dihitung'
                : `${data.budgetUsage}%`}
            </Descriptions.Item>

            <Descriptions.Item label="Biaya aktual dikurangi anggaran">
              {money(data.budgetVariance, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Piutang jatuh tempo">
              {money(data.overdueReceivable, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Total credit tersimpan pada invoice">
              {money(data.storedCredit, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Nilai kontrak dikurangi biaya tercatat">
              {money(data.contractCostGap, data.currency)}
            </Descriptions.Item>

            <Descriptions.Item label="Margin terhadap biaya tercatat — sementara">
              {data.recordedCostMargin === null
                ? 'Belum dapat dihitung'
                : `${data.recordedCostMargin}%`}
            </Descriptions.Item>
          </Descriptions>

          <Alert
            type="info"
            showIcon
            style={{ marginTop: 16 }}
            message="Pembayaran dihitung dari riwayat pembayaran aktif."
            description="Margin sementara belum memasukkan estimasi biaya pekerjaan tersisa. Pembayaran pelanggan tidak digunakan sebagai pengurang biaya proyek."
          />

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Rincian Invoice dan Piutang
          </Typography.Title>

          <Table
            rowKey="_id"
            dataSource={data.invoiceDetails}
            scroll={{ x: 900 }}
            columns={[
              {
                title: 'Invoice',
                render: (_, row) => `${row.number}/${row.year}`,
              },
              {
                title: 'Nilai bersih',
                render: (_, row) => money(row.total, data.currency),
              },
              {
                title: 'Pembayaran tercatat',
                render: (_, row) => money(row.received, data.currency),
              },
              {
                title: 'Credit invoice',
                render: (_, row) =>
                  money(row.storedCredit, data.currency),
              },
              {
                title: 'Piutang',
                render: (_, row) =>
                  money(row.remaining, data.currency),
              },
              {
                title: 'Status tersimpan',
                dataIndex: 'paymentStatus',
              },
              {
                title: 'Jatuh tempo',
                render: (_, row) => (row.overdue ? 'Ya' : 'Tidak'),
              },
            ]}
          />

          <Typography.Text type="secondary">
            Waktu perhitungan:{' '}
            {new Date(data.generatedAt).toLocaleString('id-ID')}
          </Typography.Text>
        </>
      )}
    </div>
  );
}