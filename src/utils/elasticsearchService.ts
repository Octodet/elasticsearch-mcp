import {
  Client,
  ClientOptions,
  Transport,
  TransportRequestOptions,
  TransportRequestParams,
} from "@elastic/elasticsearch";
import fs from "fs";
import {
  ElasticsearchConfig,
  IndexInfo,
  ShardInfo,
  ClusterHealth,
} from "./models.js";
import { VERSION } from "../index.js";

// Prepend a path prefix to every request path
class CustomTransport extends Transport {
  private readonly pathPrefix: string;

  constructor(
    opts: ConstructorParameters<typeof Transport>[0],
    pathPrefix: string
  ) {
    super(opts);
    this.pathPrefix = pathPrefix;
  }

  async request(
    params: TransportRequestParams,
    options?: TransportRequestOptions
  ): Promise<any> {
    const newParams = { ...params, path: this.pathPrefix + params.path };
    return await super.request(newParams, options);
  }
}

export class ElasticsearchService {
  private client: Client;
  private config: ElasticsearchConfig;

  constructor(config: ElasticsearchConfig) {
    this.config = config;
    this.client = this.createClient(config);
  }

  // Create the Elasticsearch client with appropriate configuration
  private createClient(config: ElasticsearchConfig): Client {
    const {
      url,
      apiKey,
      username,
      password,
      caCert,
      pathPrefix,
      version,
      sslSkipVerify,
    } = config;

    const clientOptions: ClientOptions = {
      node: url,
      headers: {
        "user-agent": `octodet-elasticsearch-mcp/${VERSION}`,
      },
    };

    // Set up custom transport with path prefix if needed
    if (pathPrefix != null) {
      const verifiedPathPrefix = pathPrefix;
      clientOptions.Transport = class extends CustomTransport {
        constructor(opts: ConstructorParameters<typeof Transport>[0]) {
          super(opts, verifiedPathPrefix);
        }
      };
    }

    // Configure authentication
    if (apiKey != null) {
      clientOptions.auth = { apiKey };
    } else if (username != null && password != null) {
      clientOptions.auth = { username, password };
    }

    // Configure TLS/SSL settings
    clientOptions.tls = {};
    if (caCert != null && caCert.length > 0) {
      try {
        const ca = fs.readFileSync(caCert);
        clientOptions.tls.ca = ca;
      } catch (error) {
        console.error(
          `Failed to read certificate file: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    // Configure version-specific settings
    if (version === "8") {
      clientOptions.maxRetries = 5;
      clientOptions.requestTimeout = 30000;
      clientOptions.headers = {
        accept: "application/vnd.elasticsearch+json;compatible-with=8",
        "content-type": "application/vnd.elasticsearch+json;compatible-with=8",
      };
    } else if (version === "9") {
      clientOptions.maxRetries = 5;
      clientOptions.requestTimeout = 30000;
    }

    // Skip SSL verification if requested
    if (sslSkipVerify === true) {
      clientOptions.tls.rejectUnauthorized = false;
    }

    return new Client(clientOptions);
  }

  // Get the Elasticsearch client instance
  getClient(): Client {
    return this.client;
  }

  // List indices matching a pattern
  async listIndices(indexPattern: string): Promise<IndexInfo[]> {
    const response = await this.client.cat.indices({
      index: indexPattern,
      format: "json",
      h: "index,health,status,docs.count,store.size,pri,rep",
    });

    return response.map((index: any) => ({
      index: index.index,
      health: index.health,
      status: index.status,
      docsCount: parseInt(index["docs.count"] || "0", 10),
      storeSize: index["store.size"] || "0",
      primaryShards: parseInt(index.pri || "0", 10),
      replicaShards: parseInt(index.rep || "0", 10),
    }));
  }

  // Get mappings for an index
  async getMappings(index: string): Promise<any> {
    const response = await this.client.indices.getMapping({
      index,
    });
    return response[index]?.mappings || {};
  }

  // Get cluster health information
  async getClusterHealth(): Promise<ClusterHealth> {
    const response = await this.client.cluster.health();

    return {
      status: response.status,
      nodeCount: response.number_of_nodes,
      datanodeCount: response.number_of_data_nodes,
      activePrimaryShards: response.active_primary_shards,
      activeShards: response.active_shards,
      relocatingShards: response.relocating_shards,
      initializingShards: response.initializing_shards,
      unassignedShards: response.unassigned_shards,
      pendingTasks: response.number_of_pending_tasks,
    };
  }

  // Get shard information
  async getShards(index?: string): Promise<ShardInfo[]> {
    const response = await this.client.cat.shards({
      index,
      format: "json",
    });

    return response.map((shard: any) => ({
      index: shard.index,
      shard: shard.shard,
      prirep: shard.prirep,
      state: shard.state,
      docs: shard.docs,
      store: shard.store,
      ip: shard.ip,
      node: shard.node,
    }));
  }

  // Perform a search with flexible query parameters
  async search(index: string, queryBody: any): Promise<any> {
    return await this.client.search({
      index,
      ...queryBody,
    });
  }

  // Add a document to an index
  async addDocument(index: string, document: any, id?: string): Promise<any> {
    const params: any = { index, document };
    if (id) params.id = id;
    return await this.client.index(params);
  }

  // Update a document
  async updateDocument(index: string, id: string, document: any): Promise<any> {
    return await this.client.update({
      index,
      id,
      doc: document,
    });
  }

  // Delete a document
  async deleteDocument(index: string, id: string): Promise<any> {
    return await this.client.delete({ index, id });
  }

  // Update documents by query
  async updateByQuery(params: any): Promise<any> {
    return await this.client.updateByQuery(params);
  }

  // Delete documents by query
  async deleteByQuery(params: any): Promise<any> {
    return await this.client.deleteByQuery(params);
  }

  // Perform bulk operations
  async bulk(operations: any[], pipeline?: string): Promise<any> {
    return await this.client.bulk({
      refresh: true,
      pipeline,
      operations,
    });
  }

  // Get index templates
  async getIndexTemplates(name?: string): Promise<any> {
    return await this.client.indices.getIndexTemplate({
      name,
    });
  }

  // Get index aliases
  async getAliases(name?: string): Promise<any> {
    return await this.client.indices.getAlias({
      name,
    });
  }

  // Refresh an index
  async refreshIndex(index: string): Promise<any> {
    return await this.client.indices.refresh({
      index,
    });
  }

  // Create an index with optional settings and mappings
  async createIndex(
    index: string,
    settings?: any,
    mappings?: any
  ): Promise<any> {
    const body: any = {};

    if (settings) {
      body.settings = settings;
    }

    if (mappings) {
      body.mappings = mappings;
    }

    return await this.client.indices.create({
      index,
      ...(Object.keys(body).length > 0 ? { body } : {}),
    });
  }

  // Delete an index
  async deleteIndex(index: string): Promise<any> {
    return await this.client.indices.delete({
      index,
    });
  }

  // Get ingest pipelines
  async getPipelines(id?: string): Promise<any> {
    return await this.client.ingest.getPipeline({
      id,
    });
  }

  // Count documents in an index matching a query
  async countDocuments(index: string, query?: any): Promise<number> {
    const response = await this.client.count({
      index,
      ...(query ? { query } : {}),
    });

    return response.count;
  }
}
