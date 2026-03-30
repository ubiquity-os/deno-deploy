const DEFAULT_API_BASE_URL = "https://api.deno.com";

export class DenoApiClient {
  constructor({ token, baseUrl = DEFAULT_API_BASE_URL }) {
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request(path, { method = "GET", body, headers = {}, expectedStatuses = [200] } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!expectedStatuses.includes(response.status)) {
      const responseText = await response.text();
      throw new Error(
        `Deno API ${method} ${path} failed (${response.status}): ${responseText || "<empty response>"}`,
      );
    }

    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await response.json();
    }

    return await response.text();
  }

  async getApp(appSlug) {
    const response = await fetch(`${this.baseUrl}/v2/apps/${encodeURIComponent(appSlug)}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Deno API GET /v2/apps/${appSlug} failed (${response.status}): ${body || "<empty response>"}`);
    }

    return await response.json();
  }

  createApp(payload) {
    return this.request("/v2/apps", {
      method: "POST",
      body: payload,
      expectedStatuses: [200, 201],
    });
  }

  patchApp(appSlug, payload) {
    return this.request(`/v2/apps/${encodeURIComponent(appSlug)}`, {
      method: "PATCH",
      body: payload,
      expectedStatuses: [200],
    });
  }

  deployApp(appSlug, payload) {
    return this.request(`/v2/apps/${encodeURIComponent(appSlug)}/deploy`, {
      method: "POST",
      body: payload,
      expectedStatuses: [200, 202],
    });
  }

  getRevision(revisionId) {
    return this.request(`/v2/revisions/${encodeURIComponent(revisionId)}`, {
      expectedStatuses: [200],
    });
  }

  getRevisionBuildLogs(revisionId) {
    return this.request(`/v2/revisions/${encodeURIComponent(revisionId)}/build_logs`, {
      headers: {
        Accept: "application/x-ndjson",
      },
      expectedStatuses: [200],
    });
  }

  getRevisionTimelines(revisionId) {
    return this.request(`/v2/revisions/${encodeURIComponent(revisionId)}/timelines`, {
      expectedStatuses: [200],
    });
  }

  deleteApp(appSlug) {
    return this.request(`/v2/apps/${encodeURIComponent(appSlug)}`, {
      method: "DELETE",
      expectedStatuses: [204],
    });
  }
}
