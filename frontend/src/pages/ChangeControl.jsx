import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';
import { selectCurrentAdmin } from '@/redux/auth/selectors';

export default function ChangeControl() {
  const admin = useSelector(selectCurrentAdmin);
  const roles = admin?.businessRoles || [];
  const isPM = roles.includes('project_manager');
  const isManagement = roles.includes('management');

  const [form] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const type = Form.useWatch('type', form);

  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        const response = await request.get({
          entity: 'dashboard/projects',
        });

        if (!active) return;

        if (response?.success) {
          setProjects(response.result || []);
        } else {
          setError(response?.message || 'Daftar proyek gagal dimuat.');
        }
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

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await request.get({
          entity: `change-control/${projectId}`,
        });

        if (!active) return;

        if (!response?.success) {
          setError(response?.message || 'Data gagal dimuat.');
          return;
        }

        setData(response.result);
        form.resetFields();
      } catch {
        if (active) setError('Data gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [projectId, reload, form]);

  async function submit(values) {
    setSaving(true);

    try {
      const jsonData = {
        type: values.type,
        reason: values.reason.trim(),
        impact: values.impact.trim(),
        reference: values.reference.trim(),
      };

      if (values.type === 'budget') {
        jsonData.lines = values.lines;
      } else {
        jsonData.scope = values.scope.trim();
      }

      const response = await request.post({
        entity: `change-control/${projectId}/submit`,
        jsonData,
      });

      if (!response?.success) {
        message.error(response?.message || 'Pengajuan gagal.');
        return;
      }

      message.success(response.message);
      setReload((value) => value + 1);
    } catch {
      message.error('Pengajuan gagal.');
    } finally {
      setSaving(false);
    }
  }

  async function review(values) {
    setSaving(true);

    try {
      const response = await request.post({
        entity: `change-control/review/${selected._id}`,
        jsonData: {
          decision: values.decision,
          notes: values.notes.trim(),
        },
      });

      if (!response?.success) {
        message.error(response?.message || 'Keputusan gagal.');
        return;
      }

      message.success(response.message);
      setSelected(null);
      setReload((value) => value + 1);
    } catch {
      message.error('Keputusan gagal.');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    isPM &&
    data &&
    String(data.project.manager) === String(admin?._id);

  return (
    <div>
      <Typography.Title level={2}>
        Pengajuan Perubahan Proyek
      </Typography.Title>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Pilih proyek"
          value={projectId}
          disabled={saving || loading}
          style={{ width: 420, maxWidth: '100%' }}
          options={projects.map((project) => ({
            value: project._id,
            label: `${project.code} — ${project.name}`,
          }))}
          onChange={setProjectId}
        />

        <Button
          disabled={!projectId || saving}
          loading={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Muat Ulang
        </Button>
      </Space>

      {error && <Alert type="error" showIcon message={error} />}

      {data && (
        <>
          <Descriptions bordered column={1}>
            <Descriptions.Item label="Kontrak">
              {data.contract?.code}
            </Descriptions.Item>
            <Descriptions.Item label="Lingkup berlaku">
              {data.contract?.scope}
            </Descriptions.Item>
            <Descriptions.Item label="Versi kontrak">
              {data.contract?.currentVersion}
            </Descriptions.Item>
            <Descriptions.Item label="Anggaran berlaku">
              {data.budget
                ? `${data.budget.currency} ${data.budget.total.toLocaleString('id-ID')} — versi ${data.budget.version}`
                : 'Belum tersedia'}
            </Descriptions.Item>
          </Descriptions>

          <Alert
            style={{ marginTop: 16, marginBottom: 16 }}
            type="info"
            showIcon
            message="Pengajuan belum mengubah data berlaku."
            description="Untuk perubahan lingkup, isi referensi kesepakatan perubahan dengan pelanggan. Nilai kontrak, termin, dan tanggal proyek tidak otomatis berubah. Milestone terverifikasi yang belum ditagihkan akan memerlukan verifikasi ulang jika lingkup disetujui."
          />

          {canSubmit && (
            <Form
              form={form}
              layout="vertical"
              initialValues={{ type: 'budget' }}
              disabled={saving}
              onFinish={submit}
            >
              <Form.Item
                name="type"
                label="Jenis perubahan"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 'budget', label: 'Anggaran' },
                    { value: 'scope', label: 'Ruang lingkup' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="reason"
                label="Alasan perubahan"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input.TextArea maxLength={1500} />
              </Form.Item>

              <Form.Item
                name="impact"
                label="Dampak terhadap biaya, jadwal, dan pekerjaan"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input.TextArea maxLength={1500} />
              </Form.Item>

              <Form.Item
                name="reference"
                label="Referensi dokumen pendukung/kesepakatan"
                rules={[{ required: true, whitespace: true }]}
              >
                <Input maxLength={300} />
              </Form.Item>

              {type === 'scope' && (
                <Form.Item
                  name="scope"
                  label="Uraian lengkap ruang lingkup usulan"
                  rules={[{ required: true, min: 10 }]}
                >
                  <Input.TextArea rows={5} maxLength={5000} />
                </Form.Item>
              )}

              {type === 'budget' && (
                <>
                  <Button
                    style={{ marginBottom: 16 }}
                    disabled={!data.budget}
                    onClick={() =>
                      form.setFieldsValue({
                        lines: data.budget.lines.map((line) => ({
                          category: String(line.category),
                          description: line.description,
                          quantity: line.quantity,
                          unit: line.unit,
                          unitCost: line.unitCost,
                        })),
                      })
                    }
                  >
                    Salin Rincian Anggaran Berlaku
                  </Button>

                  <Form.List
                    name="lines"
                    rules={[
                      {
                        validator: (_, lines) =>
                          lines?.length
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error('Tambahkan rincian anggaran.')
                              ),
                      },
                    ]}
                  >
                    {(fields, { add, remove }, { errors }) => (
                      <>
                        {fields.map(({ key, name }) => (
                          <div
                            key={key}
                            style={{
                              border: '1px solid #ddd',
                              padding: 16,
                              marginBottom: 16,
                            }}
                          >
                            <Form.Item
                              name={[name, 'category']}
                              label="Kategori"
                              rules={[{ required: true }]}
                            >
                              <Select
                                options={data.categories.map((item) => ({
                                  value: item._id,
                                  label: `${item.code} — ${item.name}`,
                                }))}
                              />
                            </Form.Item>

                            <Form.Item
                              name={[name, 'description']}
                              label="Uraian biaya"
                              rules={[{ required: true, whitespace: true }]}
                            >
                              <Input maxLength={500} />
                            </Form.Item>

                            <Form.Item
                              name={[name, 'quantity']}
                              label="Jumlah"
                              rules={[{ required: true }]}
                            >
                              <InputNumber min={0.001} precision={3} />
                            </Form.Item>

                            <Form.Item
                              name={[name, 'unit']}
                              label="Satuan"
                              rules={[{ required: true, whitespace: true }]}
                            >
                              <Input maxLength={50} />
                            </Form.Item>

                            <Form.Item
                              name={[name, 'unitCost']}
                              label="Biaya satuan"
                              rules={[{ required: true }]}
                            >
                              <InputNumber min={0} precision={2} />
                            </Form.Item>

                            <Button danger onClick={() => remove(name)}>
                              Hapus Baris
                            </Button>
                          </div>
                        ))}

                        <Form.ErrorList errors={errors} />

                        <Button
                          onClick={() => add({})}
                          disabled={fields.length >= 200}
                          style={{ marginBottom: 16 }}
                        >
                          Tambah Rincian
                        </Button>
                      </>
                    )}
                  </Form.List>
                </>
              )}

              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
              >
                Ajukan Perubahan
              </Button>
            </Form>
          )}

          <Typography.Title level={4} style={{ marginTop: 24 }}>
            Pengajuan dan Riwayat Keputusan
          </Typography.Title>

          <Table
            rowKey="_id"
            dataSource={data.requests}
            scroll={{ x: 800 }}
            expandable={{
              expandedRowRender: (row) => (
                <>
                  <p><strong>Dampak:</strong> {row.impact}</p>
                  <p><strong>Referensi:</strong> {row.reference}</p>
                  <p><strong>Catatan keputusan:</strong> {row.decisionNotes || '-'}</p>
                  <p><strong>Data sebelum perubahan:</strong></p>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(row.before, null, 2)}
                  </pre>
                  <p><strong>Usulan:</strong></p>
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(row.proposed, null, 2)}
                  </pre>
                </>
              ),
            }}
            columns={[
              { title: 'Jenis', dataIndex: 'type' },
              { title: 'Alasan', dataIndex: 'reason' },
              { title: 'Status', dataIndex: 'status' },
              {
                title: 'Pengaju',
                render: (_, row) => row.requestedBy?.name || '-',
              },
              {
                title: 'Pemeriksa',
                render: (_, row) => row.decidedBy?.name || '-',
              },
              {
                title: 'Tindakan',
                render: (_, row) =>
                  isManagement &&
                  row.status === 'submitted' &&
                  String(row.requestedBy?._id) !== String(admin?._id) ? (
                    <Button
                      onClick={() => {
                        reviewForm.resetFields();
                        setSelected(row);
                      }}
                    >
                      Periksa
                    </Button>
                  ) : '-',
              },
            ]}
          />
        </>
      )}

      <Modal
        title="Keputusan Management"
        open={Boolean(selected)}
        footer={null}
        closable={!saving}
        maskClosable={!saving}
        onCancel={() => {
          if (!saving) setSelected(null);
        }}
      >
        <p>{selected?.reason}</p>
        <p>{selected?.impact}</p>
        <p>Referensi: {selected?.reference}</p>

        <Form
          form={reviewForm}
          layout="vertical"
          onFinish={review}
          disabled={saving}
        >
          <Form.Item
            name="decision"
            label="Keputusan"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'approved', label: 'Setujui' },
                { value: 'rejected', label: 'Tolak' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Catatan pemeriksaan"
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={3} maxLength={1500} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
          >
            Simpan Keputusan
          </Button>
        </Form>
      </Modal>
    </div>
  );
}