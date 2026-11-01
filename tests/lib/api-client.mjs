// Klien HTTP kecil untuk PocketBase: dipakai unit/API test dan e2e seeding.
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.token = "";
  }

  async request(method, path, { body, form, headers = {} } = {}) {
    const finalHeaders = { ...headers };
    let payload;

    if (form) {
      payload = form;
    } else if (body !== undefined) {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    if (this.token) finalHeaders.Authorization = this.token;

    const response = await fetch(this.baseUrl + path, {
      method,
      headers: finalHeaders,
      body: payload,
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return { status: response.status, data, headers: response.headers };
  }

  // Melempar ApiError untuk status >= 400; dipakai pada jalur yang harus sukses.
  async json(method, path, options) {
    const { status, data } = await this.request(method, path, options);

    if (status >= 400) {
      throw new ApiError(
        `${method} ${path} -> ${status}: ${JSON.stringify(data).slice(0, 500)}`,
        status,
        data
      );
    }

    return data;
  }

  async login(identity, password) {
    const data = await this.json("POST", "/api/collections/users/auth-with-password", {
      body: { identity, password },
    });
    this.token = data.token;
    return data.record;
  }

  async loginSuperuser(identity, password) {
    const data = await this.json(
      "POST",
      "/api/collections/_superusers/auth-with-password",
      { body: { identity, password } }
    );
    this.token = data.token;
    return data.record;
  }

  async list(collection, { filter, sort, perPage = 50 } = {}) {
    const params = new URLSearchParams({ perPage: String(perPage) });
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);

    return this.json(
      "GET",
      `/api/collections/${collection}/records?${params.toString()}`
    );
  }

  async create(collection, body) {
    return this.json("POST", `/api/collections/${collection}/records`, { body });
  }

  async update(collection, id, body) {
    return this.json("PATCH", `/api/collections/${collection}/records/${id}`, {
      body,
    });
  }

  async remove(collection, id) {
    return this.request("DELETE", `/api/collections/${collection}/records/${id}`);
  }
}

export async function expectStatus(promise, status, label = "") {
  const { status: actual, data } = await promise;

  if (actual !== status) {
    throw new Error(
      `${label || "request"} diharapkan ${status}, dapat ${actual}: ` +
        `${JSON.stringify(data).slice(0, 400)}`
    );
  }

  return data;
}
