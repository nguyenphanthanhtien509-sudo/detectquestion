(() => {
  const config = window.LICENSE_PORTAL_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const localMode = Boolean(config.localAdminKey);
  let token = sessionStorage.getItem('license_admin_token') || '';
  let editingStudentId = null;

  const setNotice = (message, isError = false) => {
    if ($('appNotice')) {
      $('appNotice').textContent = message;
      $('appNotice').style.color = isError ? '#f87171' : '';
    }
  };

  const setEditMode = (account = null) => {
    editingStudentId = account ? account.student_id : null;
    if ($('studentId')) {
      $('studentId').value = account ? account.student_id : '';
      $('studentId').readOnly = Boolean(account);
      if (account) {
        $('studentId').classList.add('opacity-70', 'cursor-not-allowed');
      } else {
        $('studentId').classList.remove('opacity-70', 'cursor-not-allowed');
      }
    }
    if ($('displayName')) {
      $('displayName').value = account ? (account.display_name || '') : '';
      if (account) $('displayName').focus();
    }
    if ($('isActiveSelect')) {
      $('isActiveSelect').value = account ? (account.is_active ? 'true' : 'false') : 'true';
    }
    if ($('saveButton')) {
      $('saveButton').textContent = account ? 'Lưu cập nhật' : 'Lưu tài khoản';
    }
    if ($('cancelEditButton')) {
      $('cancelEditButton').style.display = account ? 'inline-flex' : 'none';
    }
    if ($('formTitle')) {
      $('formTitle').textContent = account ? `Sửa tài khoản: ${account.student_id}` : 'Cấp / cập nhật tài khoản MSV';
    }
  };

  const api = (path, options = {}) => fetch(`${config.supabaseUrl}/functions/v1/${path}`, {
    ...options,
    headers: { apikey: config.supabaseAnonKey, authorization: `Bearer ${token}`, 'x-local-admin-key': config.localAdminKey || '', 'content-type': 'application/json', ...(options.headers || {}) },
  });

  const call = async (action, studentId, extra = {}) => {
    const response = await api('admin-accounts', { method: 'POST', body: JSON.stringify({ action, studentId, ...extra }) });
    if (!response.ok) throw new Error('Thao tác không thành công.');
  };

  const actionButton = (label, className, handler) => {
    const button = document.createElement('button'); button.textContent = label; button.className = className; button.addEventListener('click', handler); return button;
  };

  async function loadAccounts() {
    setNotice('Đang tải…');
    const response = await api('admin-accounts');
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice('Phiên quản trị không hợp lệ hoặc tài khoản chưa có quyền.', true); return; }
    const rows = $('rows'); if (!rows) return;
    rows.replaceChildren();
    body.accounts.forEach((account) => {
      const row = document.createElement('tr');
      const id = document.createElement('td'); const strong = document.createElement('strong'); strong.textContent = account.student_id; id.append(strong);
      const name = document.createElement('td'); name.textContent = account.display_name || '—';
      const enabled = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = `status ${account.is_active ? '' : 'off'}`;
      tag.textContent = account.is_active ? 'Đang bật' : 'Đã tắt';
      tag.title = 'Bấm để đổi nhanh Bật / Tắt';
      tag.style.cursor = 'pointer';
      tag.addEventListener('click', async () => {
        const nextState = !account.is_active;
        if (confirm(`Đổi trạng thái ${account.student_id} sang "${nextState ? 'Đang bật' : 'Đã tắt'}"?`)) {
          await call('upsert', account.student_id, { displayName: account.display_name || '', isActive: nextState });
          loadAccounts();
        }
      });
      enabled.append(tag);

      const device = document.createElement('td'); device.textContent = account.last_seen_at ? 'Đã dùng' : 'Chưa dùng';
      const actions = document.createElement('td');
      actions.append(
        actionButton('Sửa', 'secondary', () => setEditMode(account)),
        document.createTextNode(' '),
        actionButton('Reset thiết bị', 'secondary', async () => {
          if (confirm(`Cho phép ${account.student_id} đăng nhập trên máy mới?`)) {
            await call('reset-device', account.student_id);
            loadAccounts();
          }
        }),
        document.createTextNode(' '),
        actionButton('Xóa', 'danger', async () => {
          if (confirm(`Xóa tài khoản ${account.student_id}?`)) {
            if (editingStudentId === account.student_id) setEditMode(null);
            await call('delete', account.student_id);
            loadAccounts();
          }
        })
      );
      row.append(id, name, enabled, device, actions); rows.append(row);
    });
    setNotice(`${body.accounts.length} tài khoản`);
  }

  async function signIn() {
    if ($('notice')) $('notice').textContent = '';
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: config.supabaseAnonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) });
    const body = await response.json().catch(() => ({}));
    if (!body.access_token) { if ($('notice')) $('notice').textContent = 'Đăng nhập thất bại.'; return; }
    token = body.access_token; sessionStorage.setItem('license_admin_token', token);
    if ($('login')) $('login').style.display = 'none';
    if ($('app')) $('app').style.display = 'block';
    loadAccounts();
  }

  async function saveAccount() {
    try {
      const id = $('studentId').value.trim();
      if (!id) throw new Error('Hãy nhập MSV.');
      const isActive = $('isActiveSelect') ? ($('isActiveSelect').value === 'true') : true;
      await call('upsert', id, { displayName: $('displayName').value.trim(), isActive });
      setNotice(editingStudentId ? `Đã cập nhật ${id}.` : `Đã lưu ${id}.`);
      setEditMode(null);
      loadAccounts();
    } catch (error) {
      setNotice(error.message, true);
    }
  }

  if ($('signInButton')) $('signInButton').addEventListener('click', signIn);
  if ($('refreshButton')) $('refreshButton').addEventListener('click', loadAccounts);
  if ($('signOutButton')) $('signOutButton').addEventListener('click', () => { sessionStorage.removeItem('license_admin_token'); location.reload(); });
  if ($('saveButton')) $('saveButton').addEventListener('click', saveAccount);
  if ($('cancelEditButton')) $('cancelEditButton').addEventListener('click', () => setEditMode(null));

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    if ($('notice')) $('notice').textContent = 'Thiếu cấu hình Supabase. Hãy chạy bằng local-server.js.';
  } else if (localMode || token) {
    if ($('login')) $('login').style.display = 'none';
    if ($('app')) $('app').style.display = 'block';
    loadAccounts();
  }
})();
