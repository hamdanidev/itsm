// Klien HTTP kecil untuk PocketBase yang dipakai alat seed manual.
//
// Tidak mengimpor helper test supaya `scripts/seed.mjs` tetap bisa dijalankan
// pada instalasi nyata tanpa membawa folder tests.
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
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.token = "";
  }

  async request(method, path, { body, form, headers = {}, timeoutMs = 30_000 } = {}) {
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
      signal: AbortSignal.timeout(timeoutMs),
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

  async json(method, path, options) {
    const { status, data } = await this.request(method, path, options);

    if (status >= 400) {
      throw new ApiError(
        `${method} ${path} -> ${status}: ${JSON.stringify(data).slice(0, 600)}`,
        status,
        data
      );
    }

    return data;
  }

  async get(path) {
    return this.json("GET", path);
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

  async list(collection, { filter, sort, perPage = 100, page = 1 } = {}) {
    const params = new URLSearchParams({
      perPage: String(perPage),
      page: String(page),
    });
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);

    return this.json(
      "GET",
      `/api/collections/${collection}/records?${params.toString()}`
    );
  }

  // Mengambil seluruh halaman. Dataset seed masih kecil, jadi aman.
  async listAll(collection, { filter, sort, perPage = 100 } = {}) {
    const items = [];
    let page = 1;

    for (;;) {
      const result = await this.list(collection, { filter, sort, perPage, page });
      items.push(...result.items);

      if (page >= result.totalPages || result.items.length === 0) break;
      page += 1;
    }

    return items;
  }

  async findOne(collection, filter, sort = "") {
    const params = new URLSearchParams({ perPage: "1" });
    if (filter) params.set("filter", filter);
    if (sort) params.set("sort", sort);

    const result = await this.json(
      "GET",
      `/api/collections/${collection}/records?${params.toString()}`
    );

    return result.items[0] || null;
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

export async function waitForServer(baseUrl, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(1_500),
      });
      if (response.ok) return true;
    } catch {
      // Server belum siap.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}
