import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

async function findContract(contractId) {
  for (let page = 1; page <= 1000; page += 1) {
    const response = await request.get({
      entity: `contract/list?page=${page}&limit=100`,
    });

    if (!response?.success) {
      throw new Error(
        response?.message || 'Kontrak gagal dimuat.'
      );
    }

    const rows = response.result || [];
    const contract = rows.find(
      (row) => String(row._id) === String(contractId)
    );

    if (contract) return contract;

    const total = response.pagination?.total;

    if (
      rows.length < 100 ||
      (typeof total === 'number' && page * 100 >= total)
    ) {
      break;
    }
  }

  throw new Error('Kontrak proyek tidak ditemukan.');
}

export default function ProjectMilestone({
  project,
  milestones = [],
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function openForm() {
    setOpen(true);
    setContract(null);
    setError('');
    setLoading(true);

    try {
      const contractId = project.contract?._id || project.contract;
      const result = await findContract(contractId);

      if (!result.billingTerms?.length) {
        throw new Error('Kontrak belum memiliki termin pembayaran.');
      }

      setContract(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createPlan(values) {
    setSaving(true);
    setError('');

    try {
      const rows = values.milestones || [];

      if (!rows.length) {
        throw new Error('Tambahkan minimal satu milestone.');
      }

      const codes = rows.map((row) => row.code.trim());

      if (new Set(codes).size !== codes.length) {
        throw new Error('Kode milestone tidak boleh sama.');
      }

      const totalWeight = rows.reduce(
        (sum, row) =>
          sum + Math.round(row.progressWeight * 100),
        0
      );

      if (totalWeight !== 10000) {
        throw new Error('Total bobot milestone harus 100%.');
      }

      for (const row of rows) {
        if (
          row.dueDate < dateOnly(project.startDate) ||
          row.dueDate > dateOnly(project.endDate)
        ) {
          throw new Error(
            'Tanggal milestone harus berada dalam periode proyek.'
          );
        }
      }

      const termCodes = new Set(
        contract.billingTerms.map((term) => term.code)
      );

      if (rows.some((row) => !termCodes.has(row.billingTermCode))) {
        throw new Error('Pilih termin yang tersedia dalam kontrak.');
      }

      for (const term of contract.billingTerms) {
        const allocated = rows
          .filter((row) => row.billingTermCode === term.code)
          .reduce(
            (sum, row) =>
              sum + Math.round(row.billingAmount * 100),
            0
          );

        if (allocated !== Math.round(term.amount * 100)) {
          throw new Error(
            `Total milestone untuk termin ${term.code} harus sesuai nilai termin kontrak.`
          );
        }
      }

      const response = await request.post({
        entity: 'milestone/create-plan',
        jsonData: {
          project: project._id,
          milestones: rows.map((row) => ({
            code: row.code.trim(),
            name: row.name.trim(),
            dueDate: row.dueDate,
            progressWeight: row.progressWeight,
            billingTermCode: row.billingTermCode,
            billingAmount: row.billingAmount,
          })),
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Rencana milestone gagal disimpan.'
        );
      }

      message.success('Rencana milestone berhasil dibuat.');
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const terms = contract?.billingTerms || [];

  const initialMilestones = terms.map((term, index) => {
    const baseWeight = Math.floor(10000 / terms.length);

    const weight =
      index === terms.length - 1
        ? 10000 - baseWeight * (terms.length - 1)
        : baseWeight;

    return {
      code: `M${index + 1}`,
      name: term.name,
      dueDate: dateOnly(project.endDate),
      progressWeight: weight / 100,
      billingTermCode: term.code,
      billingAmount: term.amount,
    };
  });

  return (
    <>
      <Button
        type="primary"
        disabled={milestones.length > 0}
        onClick={openForm}
        style={{ marginBottom: 16 }}
      >
        Buat Rencana Milestone
      </Button>

      {open && (
        <Modal
          open
          title="Rencana Milestone Proyek"
          width={800}
          footer={null}
          closable={!saving && !loading}
          maskClosable={!saving && !loading}
          onCancel={() => setOpen(false)}
        >
          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginBottom: 16 }}
            />
          )}

          {loading && (
            <Typography.Paragraph>
              Memuat termin kontrak…
            </Typography.Paragraph>
          )}

          {contract && !loading && (
            <>
              <Typography.Paragraph>
                Kontrak: <strong>{contract.code}</strong>.
                Total bobot harus 100% dan alokasi nilai
                harus sesuai setiap termin kontrak.
              </Typography.Paragraph>

              {terms.map((term) => (
                <Typography.Paragraph key={term.code}>
                  {term.code} — {term.name}:{' '}
                  <strong>
                    {contract.currency}{' '}
                    {Number(term.amount).toLocaleString('id-ID')}
                  </strong>
                </Typography.Paragraph>
              ))}

              <Form
                layout="vertical"
                initialValues={{
                  milestones: initialMilestones,
                }}
                onFinish={createPlan}
                disabled={saving}
              >
                <Form.List name="milestones">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, name }) => (
                        <div
                          key={key}
                          style={{
                            border: '1px solid #ddd',
                            borderRadius: 6,
                            padding: 16,
                            marginBottom: 16,
                          }}
                        >
                          <Typography.Title level={5}>
                            Milestone {name + 1}
                          </Typography.Title>

                          <Form.Item
                            name={[name, 'code']}
                            label="Kode milestone"
                            rules={[
                              {
                                required: true,
                                whitespace: true,
                                message: 'Kode wajib diisi.',
                              },
                            ]}
                          >
                            <Input maxLength={50} />
                          </Form.Item>

                          <Form.Item
                            name={[name, 'name']}
                            label="Nama milestone"
                            rules={[
                              {
                                required: true,
                                whitespace: true,
                                message: 'Nama wajib diisi.',
                              },
                            ]}
                          >
                            <Input maxLength={200} />
                          </Form.Item>

                          <Form.Item
                            name={[name, 'dueDate']}
                            label="Tanggal target"
                            rules={[
                              {
                                required: true,
                                message: 'Tanggal target wajib diisi.',
                              },
                            ]}
                          >
                            <Input
                              type="date"
                              min={dateOnly(project.startDate)}
                              max={dateOnly(project.endDate)}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[name, 'progressWeight']}
                            label="Bobot progres (%)"
                            rules={[
                              {
                                required: true,
                                message: 'Bobot wajib diisi.',
                              },
                              {
                                type: 'number',
                                min: 0.01,
                                max: 100,
                                message: 'Bobot harus lebih dari 0 sampai 100.',
                              },
                            ]}
                          >
                            <InputNumber
                              min={0.01}
                              max={100}
                              precision={2}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[name, 'billingTermCode']}
                            label="Termin pembayaran"
                            rules={[
                              {
                                required: true,
                                message: 'Pilih termin.',
                              },
                            ]}
                          >
                            <Select
                              options={terms.map((term) => ({
                                value: term.code,
                                label: `${term.code} — ${term.name}`,
                              }))}
                            />
                          </Form.Item>

                          <Form.Item
                            name={[name, 'billingAmount']}
                            label="Nilai milestone"
                            rules={[
                              {
                                required: true,
                                message: 'Nilai wajib diisi.',
                              },
                              {
                                type: 'number',
                                min: 0.01,
                                message: 'Nilai harus lebih dari nol.',
                              },
                            ]}
                          >
                            <InputNumber
                              min={0.01}
                              precision={2}
                              style={{ width: '100%' }}
                            />
                          </Form.Item>

                          <Button
                            danger
                            onClick={() => remove(name)}
                          >
                            Hapus Milestone
                          </Button>
                        </div>
                      ))}

                      <Button
                        block
                        type="dashed"
                        disabled={fields.length >= 100}
                        onClick={() => add({})}
                        style={{ marginBottom: 16 }}
                      >
                        Tambah Milestone
                      </Button>
                    </>
                  )}
                </Form.List>

                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={saving}
                  >
                    Simpan Rencana Milestone
                  </Button>

                  <Button onClick={() => setOpen(false)}>
                    Batal
                  </Button>
                </Space>
              </Form>
            </>
          )}
        </Modal>
      )}
    </>
  );
}