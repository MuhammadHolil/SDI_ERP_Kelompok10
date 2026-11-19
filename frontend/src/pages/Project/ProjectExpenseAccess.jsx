import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Select,
  Typography,
  message,
} from 'antd';

import { request } from '@/request';

export default function ProjectExpenseAccess({ project }) {
  const [form] = Form.useForm();
  const [choices, setChoices] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      setChoices(null);

      try {
        const [optionsResponse, accessResponse] =
          await Promise.all([
            request.get({
              entity: `project/access-options/${project._id}`,
            }),
            request.get({
              entity: `project/access/${project._id}`,
            }),
          ]);

        if (!active) return;

        if (!optionsResponse?.success) {
          throw new Error(
            optionsResponse?.message ||
              'Pilihan akun gagal dimuat.'
          );
        }

        if (!accessResponse?.success) {
          throw new Error(
            accessResponse?.message ||
              'Pengaturan akses gagal dimuat.'
          );
        }

        setChoices(optionsResponse.result);

        form.setFieldsValue({
          teamMembers: (
            accessResponse.result.teamMembers || []
          ).map((value) => value?._id || value),

          expenseApprovers: (
            accessResponse.result.expenseApprovers || []
          ).map((value) => value?._id || value),
        });
      } catch (err) {
        if (active) {
          setError(err.message);
          form.resetFields();
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [project._id, reload, form]);

  async function saveAccess(values) {
    setSaving(true);
    setError('');

    try {
      const teamMembers = values.teamMembers || [];
      const expenseApprovers = values.expenseApprovers || [];

      const validMembers = new Set(
        choices.teamMembers.map((account) => account._id)
      );

      const validApprovers = new Set(
        choices.expenseApprovers.map((account) => account._id)
      );

      if (
        teamMembers.some((id) => !validMembers.has(id)) ||
        expenseApprovers.some((id) => !validApprovers.has(id))
      ) {
        throw new Error(
          'Ada akun yang tidak tersedia. Hapus pilihan tersebut dan pilih akun aktif.'
        );
      }

      const response = await request.put({
        entity: `project/access/${project._id}`,
        jsonData: {
          teamMembers,
          expenseApprovers,
        },
      });

      if (!response?.success) {
        throw new Error(
          response?.message ||
            'Pengaturan akses gagal disimpan.'
        );
      }

      message.success('Pengaturan akses proyek berhasil disimpan.');
      setReload((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 32 }}>
      <Typography.Title level={4}>
        Akses Pengeluaran Proyek
      </Typography.Title>

      <Typography.Paragraph>
        Pilih pencatat dan pemeriksa pengeluaran.
        Gunakan akun berbeda untuk menjalankan kedua tugas.
        Menghapus pilihan lalu menyimpan akan mencabut
        penugasan akun tersebut dari proyek ini.
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
        loading={loading}
        disabled={saving}
        onClick={() => setReload((value) => value + 1)}
        style={{ marginBottom: 16 }}
      >
        Muat ulang pengaturan
      </Button>

      <Form
        form={form}
        layout="vertical"
        onFinish={saveAccess}
        disabled={loading || saving || !choices}
        style={{ maxWidth: 700 }}
      >
        <Form.Item
          name="teamMembers"
          label="Pencatat pengeluaran"
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder="Pilih akun pencatat"
            options={(choices?.teamMembers || []).map(
              (account) => ({
                value: account._id,
                label: account.name,
              })
            )}
          />
        </Form.Item>

        <Form.Item
          name="expenseApprovers"
          label="Pemeriksa pengeluaran"
        >
          <Select
            mode="multiple"
            showSearch
            optionFilterProp="label"
            placeholder="Pilih akun pemeriksa"
            options={(choices?.expenseApprovers || []).map(
              (account) => ({
                value: account._id,
                label: account.name,
              })
            )}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={saving}
          >
            Simpan Akses Proyek
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
} 