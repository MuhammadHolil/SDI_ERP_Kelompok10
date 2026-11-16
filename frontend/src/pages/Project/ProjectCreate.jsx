import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

export default function ProjectCreate({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadContracts() {
    setLoading(true);
    setError('');
    setContracts([]);

    try {
      const records = [];

      for (let page = 1; page <= 1000; page += 1) {
        const response = await request.get({
          entity: `contract/list?page=${page}&limit=100`,
        });

        if (!response?.success) {
          throw new Error(
            response?.message || 'Daftar kontrak gagal dimuat.'
          );
        }

        const batch = response.result || [];
        records.push(...batch);

        const total = response.pagination?.total;

        if (
          batch.length < 100 ||
          (typeof total === 'number' && records.length >= total)
        ) {
          setContracts(
            records.filter((contract) => contract.status === 'agreed')
          );
          return;
        }
      }

      throw new Error('Daftar kontrak terlalu besar.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function createProject(values) {
    setSaving(true);
    setError('');

    try {
      if (values.endDate < values.startDate) {
        throw new Error(
          'Tanggal selesai tidak boleh sebelum tanggal mulai.'
        );
      }

      const response = await request.post({
        entity: 'project/create',
        jsonData: {
          code: values.code.trim(),
          name: values.name.trim(),
          contract: values.contract,
          startDate: values.startDate,
          endDate: values.endDate,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message || 'Proyek gagal dibuat.'
        );
      }

      message.success('Proyek berhasil dibuat.');
      setOpen(false);
      onCreated?.(response.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="primary"
        style={{ marginRight: 8, marginBottom: 16 }}
        onClick={() => {
          setOpen(true);
          loadContracts();
        }}
      >
        Buat Proyek
      </Button>

      {open && (
        <Modal
          open
          title="Buat Proyek"
          footer={null}
          width={720}
          closable={!saving && !loading}
          maskClosable={!saving && !loading}
          onCancel={() => setOpen(false)}
        >
          <Typography.Paragraph>
            Pilih kontrak yang telah disepakati.
            Akun PM yang membuat proyek akan menjadi
            manajer proyek tersebut.
          </Typography.Paragraph>

          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              style={{ marginBottom: 16 }}
            />
          )}

          <Button
            onClick={loadContracts}
            loading={loading}
            disabled={saving}
            style={{ marginBottom: 16 }}
          >
            Muat ulang kontrak
          </Button>

          {!loading && !error && contracts.length === 0 && (
            <Alert
              type="info"
              message="Belum ada kontrak agreed."
              description="Sales perlu mencatat kesepakatan kontrak terlebih dahulu."
              style={{ marginBottom: 16 }}
            />
          )}

          <Form
            layout="vertical"
            onFinish={createProject}
            disabled={saving || loading}
          >
            <Form.Item
              name="code"
              label="Kode proyek"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: 'Kode proyek wajib diisi.',
                },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>

            <Form.Item
              name="name"
              label="Nama proyek"
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: 'Nama proyek wajib diisi.',
                },
              ]}
            >
              <Input maxLength={200} />
            </Form.Item>

            <Form.Item
              name="contract"
              label="Kontrak yang disepakati"
              rules={[
                {
                  required: true,
                  message: 'Pilih kontrak.',
                },
              ]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Pilih kontrak agreed"
                options={contracts.map((contract) => ({
                  value: contract._id,
                  label:
                    `${contract.code} — ` +
                    `${contract.client?.name || 'Pelanggan'} — ` +
                    `${contract.currency} ` +
                    Number(contract.contractValue).toLocaleString('id-ID'),
                }))}
              />
            </Form.Item>

            <Form.Item
              name="startDate"
              label="Tanggal mulai"
              rules={[
                {
                  required: true,
                  message: 'Tanggal mulai wajib diisi.',
                },
              ]}
            >
              <Input type="date" />
            </Form.Item>

            <Form.Item
              name="endDate"
              label="Tanggal selesai"
              rules={[
                {
                  required: true,
                  message: 'Tanggal selesai wajib diisi.',
                },
              ]}
            >
              <Input type="date" />
            </Form.Item>

            <Space>
              <Button
                type="primary"
                htmlType="submit"
                loading={saving}
                disabled={contracts.length === 0}
              >
                Simpan Proyek
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