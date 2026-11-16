import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

export default function ContractAgreement({
  contract,
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submitAgreement(values) {
    setSaving(true);
    setError('');

    try {
      const terms = (values.billingTerms || []).map((term) => ({
        code: term.code.trim(),
        name: term.name.trim(),
        amount: term.amount,
      }));

      if (!terms.length) {
        throw new Error('Tambahkan minimal satu termin.');
      }

      const codes = terms.map((term) => term.code);

      if (new Set(codes).size !== codes.length) {
        throw new Error('Kode termin tidak boleh sama.');
      }

      const total = terms.reduce(
        (sum, term) => sum + Math.round(term.amount * 100),
        0
      );

      const contractTotal = Math.round(
        contract.contractValue * 100
      );

      if (total !== contractTotal) {
        throw new Error(
          'Total seluruh termin harus sama dengan nilai kontrak.'
        );
      }

      const response = await request.post({
        entity: `contract/agree/${contract._id}`,
        jsonData: {
          agreementReference: values.agreementReference.trim(),
          billingTerms: terms,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Kesepakatan gagal disimpan.'
        );
      }

      message.success('Kesepakatan kontrak berhasil dicatat.');
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (contract.status !== 'draft') {
    return <span>{contract.status === 'agreed'
      ? 'Sudah disepakati'
      : 'Tidak tersedia'}</span>;
  }

  return (
    <>
      <Button
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        Catat Kesepakatan
      </Button>

      {open && (
        <Modal
          open
          title={`Kesepakatan ${contract.code}`}
          width={720}
          footer={null}
          closable={!saving}
          maskClosable={!saving}
          onCancel={() => setOpen(false)}
        >
          <Typography.Paragraph>
            Nilai kontrak:{' '}
            <strong>
              {contract.currency}{' '}
              {Number(contract.contractValue).toLocaleString('id-ID')}
            </strong>
            . Total seluruh termin harus sama dengan nilai ini.
          </Typography.Paragraph>

          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            layout="vertical"
            onFinish={submitAgreement}
            disabled={saving}
            initialValues={{
              billingTerms: [
                {
                  code: '',
                  name: '',
                  amount: contract.contractValue,
                },
              ],
            }}
          >
            <Form.Item
              name="agreementReference"
              label="Referensi kesepakatan"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: 'Referensi wajib diisi.',
                },
              ]}
            >
              <Input
                maxLength={200}
                placeholder="Contoh: KESEPAKATAN-WEB-001"
              />
            </Form.Item>

            <Form.List name="billingTerms">
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
                        Termin {name + 1}
                      </Typography.Title>

                      <Form.Item
                        name={[name, 'code']}
                        label="Kode termin"
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: 'Kode termin wajib diisi.',
                          },
                        ]}
                      >
                        <Input maxLength={30} />
                      </Form.Item>

                      <Form.Item
                        name={[name, 'name']}
                        label="Nama termin"
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: 'Nama termin wajib diisi.',
                          },
                        ]}
                      >
                        <Input maxLength={200} />
                      </Form.Item>

                      <Form.Item
                        name={[name, 'amount']}
                        label="Nilai termin"
                        rules={[
                          {
                            required: true,
                            message: 'Nilai termin wajib diisi.',
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
                        Hapus Termin
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
                    Tambah Termin
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
                Simpan Kesepakatan
              </Button>

              <Button onClick={() => setOpen(false)}>
                Batal
              </Button>
            </Space>
          </Form>
        </Modal>
      )}
    </>
  );
}