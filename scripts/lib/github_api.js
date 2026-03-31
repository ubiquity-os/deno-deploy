import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1.0.10/base64";

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

export class GitHubApiClient {
  constructor({ token, owner, repo, baseUrl = DEFAULT_GITHUB_API_BASE_URL }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request(path, { method = "GET", body, headers = {}, expectedStatuses = [200] } = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ubiquity-os-deno-deploy-action",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!expectedStatuses.includes(response.status)) {
      const responseText = await response.text();
      const error = new Error(
        `GitHub API ${method} ${path} failed (${response.status}): ${responseText || "<empty response>"}`,
      );
      error.status = response.status;
      throw error;
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

  getRepository() {
    return this.request(`/repos/${this.owner}/${this.repo}`, {
      expectedStatuses: [200],
    });
  }

  getRef(ref) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/ref/${encodeURIComponent(ref)}`, {
      expectedStatuses: [200],
    });
  }

  async getRefSha(ref) {
    const data = await this.getRef(ref);
    return data.object.sha;
  }

  createRef(ref, sha) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/refs`, {
      method: "POST",
      body: {
        ref: `refs/${ref}`,
        sha,
      },
      expectedStatuses: [201],
    });
  }

  async listMatchingRefs(ref) {
    const normalizedRef = String(ref).split("/").map(encodeURIComponent).join("/");
    const data = await this.request(`/repos/${this.owner}/${this.repo}/git/matching-refs/${normalizedRef}`, {
      expectedStatuses: [200],
    });

    return Array.isArray(data) ? data : [];
  }

  async getFile(path, ref) {
    const response = await fetch(
      `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "ubiquity-os-deno-deploy-action",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(
        `GitHub API GET /contents/${path} failed (${response.status}): ${body || "<empty response>"}`,
      );
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    if (Array.isArray(data)) {
      return null;
    }

    return {
      sha: data.sha,
      content: new TextDecoder().decode(decodeBase64(data.content.replace(/\s+/g, ""))),
    };
  }

  putFile({ path, branch, message, content, sha }) {
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${path}`, {
      method: "PUT",
      body: {
        message,
        branch,
        content: encodeBase64(new TextEncoder().encode(content)),
        ...(sha ? { sha } : {}),
      },
      expectedStatuses: [200, 201],
    });
  }

  deleteRef(ref) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/refs/${encodeURIComponent(ref)}`, {
      method: "DELETE",
      expectedStatuses: [204],
    });
  }
}

export async function ensureArtifactBranch({ github, sourceBranch, defaultBranch, artifactBranch }) {
  try {
    await github.getRef(`heads/${artifactBranch}`);
    return artifactBranch;
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
  }

  let baseSha;
  try {
    baseSha = await github.getRefSha(`heads/${sourceBranch}`);
  } catch (error) {
    if (error.status !== 404) {
      throw error;
    }
    baseSha = await github.getRefSha(`heads/${defaultBranch}`);
  }

  try {
    await github.createRef(`heads/${artifactBranch}`, baseSha);
  } catch (error) {
    if (error.status !== 422) {
      throw error;
    }
  }
  return artifactBranch;
}
