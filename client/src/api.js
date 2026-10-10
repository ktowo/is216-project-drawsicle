export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Small wrapper around fetch for our Express API.
//   await api('/auth/login', { method: 'POST', body: { email, password } })
//   await api('/profile/avatar', { method: 'POST', form: formData })
export async function api(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'include', headers: {} };

  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError("Can't reach the server. Is it running?", 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Something went wrong (${res.status}).`, res.status, data.code);
  }
  return data;
}
