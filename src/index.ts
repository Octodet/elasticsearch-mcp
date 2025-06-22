#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ElasticsearchService } from "./utils/elasticsearchService.js";
import { ElasticsearchConfig } from "./utils/models.js";
import { TextContent, ResponseContent } from "./types.js";
import pkg from '../package.json' with { type: 'json' };

// Import version from package.json
export const VERSION = pkg.version;

// Configuration schema with auth options

const ConfigSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "Elasticsearch URL cannot be empty")
      .describe("Elasticsearch server URL"),

    apiKey: z
      .string()
      .optional()
      .describe("API key for Elasticsearch authentication"),

    username: z
      .string()
      .optional()
      .describe("Username for Elasticsearch authentication"),

    password: z
      .string()
      .optional()
      .describe("Password for Elasticsearch authentication"),

    caCert: z
      .string()
      .optional()
      .describe("Path to custom CA certificate for Elasticsearch"),

    pathPrefix: z.string().optional().describe("Path prefix for Elasticsearch"),

    version: z
      .string()
      .optional()
      .transform((val) => (["8", "9"].includes(val || "") ? val : "8"))
      .describe("Elasticsearch version (8 or 9)"),

    sslSkipVerify: z
      .boolean()
      .optional()
      .describe("Skip SSL certificate verification"),
  })
  .refine(
    (data) => {
      // If apiKey is provided, it's valid
      if (data.apiKey != null) return true;

      // If username is provided, password must be provided
      if (data.username != null) {
        return data.password != null;
      }

      // No auth is also valid (for local development)
      return true;
    },
    {
      message:
        "Either ES_API_KEY or both ES_USERNAME and ES_PASSWORD must be provided, or no auth for local development",
      path: ["username", "password"],
    }
  );

// Function to create and configure the MCP server
export async function createOctodetElasticsearchMcpServer(
  config: ElasticsearchConfig
): Promise<McpServer> {
  const validatedConfig = ConfigSchema.parse(config);

  // Create Elasticsearch service instance
  const esService = new ElasticsearchService(validatedConfig);

  // Create server instance
  const server = new McpServer({
    name: "octodet-elasticsearch-mcp",
    version: VERSION,
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  // Tool 1: List indices
  server.tool(
    "list_indices",
    "List all available Elasticsearch indices with detailed information",
    {
      indexPattern: z
        .string()
        .trim()
        .min(1, "Index pattern is required")
        .describe('Pattern of Elasticsearch indices to list (e.g., "logs-*")'),
    },
    async ({ indexPattern }) => {
      try {
        const indicesInfo = await esService.listIndices(indexPattern);

        return {
          content: [
            {
              type: "text",
              text: `Found ${indicesInfo.length} indices matching pattern '${indexPattern}'`,
            },
            {
              type: "text",
              text: JSON.stringify(indicesInfo, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to list indices: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 2: Get mappings for an index
  server.tool(
    "get_mappings",
    "Get field mappings for a specific Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to get mappings for"),
    },
    async ({ index }) => {
      try {
        const mappings = await esService.getMappings(index);

        return {
          content: [
            {
              type: "text",
              text: `Mappings for index: ${index}`,
            },
            {
              type: "text",
              text: JSON.stringify(mappings, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to get mappings: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 3: Search an index
  server.tool(
    "search",
    "Perform an Elasticsearch search with the provided query DSL and highlighting",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to search"),

      queryBody: z
        .record(z.any())
        .describe(
          "Complete Elasticsearch query DSL object (can include query, size, from, sort, etc.)"
        ),
    },
    async ({ index, queryBody }, extra) => {
      try {
        const result = await esService.search(index, queryBody);

        // Extract the 'from' parameter from queryBody, defaulting to 0 if not provided
        const from = queryBody.from ?? 0;

        const contentFragments: TextContent[] = [];

        // Add metadata about the search results
        contentFragments.push({
          type: "text",
          text: `Total results: ${
            typeof result.hits.total === "number"
              ? result.hits.total
              : result.hits.total?.value ?? 0
          }, showing ${result.hits.hits.length} from position ${from}`,
        });

        // Add aggregation results if present
        if (result.aggregations) {
          contentFragments.push({
            type: "text",
            text: `Aggregations: ${JSON.stringify(
              result.aggregations,
              null,
              2
            )}`,
          });
        }

        // Process and add individual hit results
        result.hits.hits.forEach((hit: any) => {
          const highlightedFields = hit.highlight ?? {};
          const sourceData = hit._source ?? {};

          let content = `Document ID: ${hit._id}\nScore: ${hit._score}\n\n`;

          // Add highlighted fields
          for (const [field, highlights] of Object.entries(highlightedFields)) {
            if (Array.isArray(highlights) && highlights.length > 0) {
              content += `${field} (highlighted): ${(
                highlights as string[]
              ).join(" ... ")}\n`;
            }
          }

          // Add source fields that weren't highlighted
          for (const [field, value] of Object.entries(sourceData)) {
            if (!(field in highlightedFields)) {
              content += `${field}: ${JSON.stringify(value)}\n`;
            }
          }

          contentFragments.push({
            type: "text",
            text: content.trim(),
          });
        });

        const response: ResponseContent = {
          content: contentFragments,
        };
        return response;
      } catch (error) {
        console.error(
          `Search failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 4: Get cluster health
  server.tool(
    "get_cluster_health",
    "Get health information about the Elasticsearch cluster",
    {},
    async () => {
      try {
        const health = await esService.getClusterHealth();

        return {
          content: [
            {
              type: "text",
              text: `Elasticsearch Cluster Health:`,
            },
            {
              type: "text",
              text: JSON.stringify(health, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to get cluster health: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 5: Get shard information
  server.tool(
    "get_shards",
    "Get shard information for all or specific indices",
    {
      index: z
        .string()
        .optional()
        .describe("Optional index name to get shard information for"),
    },
    async ({ index }) => {
      try {
        const shardsInfo = await esService.getShards(index);

        return {
          content: [
            {
              type: "text",
              text: `Found ${shardsInfo.length} shards${
                index ? ` for index ${index}` : ""
              }`,
            },
            {
              type: "text",
              text: JSON.stringify(shardsInfo, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to get shard information: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 6: Add a document to an index
  server.tool(
    "add_document",
    "Add a new document to a specific Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index"),
      id: z
        .string()
        .optional()
        .describe(
          "Optional document ID (if not provided, Elasticsearch will generate one)"
        ),
      document: z.record(z.any()).describe("Document body to index"),
    },
    async ({ index, id, document }) => {
      try {
        const response = await esService.addDocument(index, document, id);
        return {
          content: [
            {
              type: "text",
              text: `Document added to index '${index}' with ID: ${response._id}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error adding document: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 7: Update a document in an index
  server.tool(
    "update_document",
    "Update an existing document in a specific Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index"),
      id: z
        .string()
        .min(1, "Document ID is required")
        .describe("Document ID to update"),
      document: z
        .record(z.any())
        .describe("Partial document body to update (fields to change)"),
    },
    async ({ index, id, document }) => {
      try {
        await esService.updateDocument(index, id, document);
        return {
          content: [
            {
              type: "text",
              text: `Document with ID '${id}' updated in index '${index}'.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating document: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 8: Delete a document from an index
  server.tool(
    "delete_document",
    "Delete a document from a specific Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index"),
      id: z
        .string()
        .min(1, "Document ID is required")
        .describe("Document ID to delete"),
    },
    async ({ index, id }) => {
      try {
        await esService.deleteDocument(index, id);
        return {
          content: [
            {
              type: "text",
              text: `Document with ID '${id}' deleted from index '${index}'.`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting document: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 9: Update documents by query
  server.tool(
    "update_by_query",
    "Update documents in an Elasticsearch index based on a query",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to update documents in"),
      query: z
        .record(z.any())
        .describe("Elasticsearch query to select documents for updating"),
      script: z
        .object({
          source: z
            .string()
            .min(1, "Script source is required")
            .describe("Painless script source for the update operation"),
          params: z
            .record(z.any())
            .optional()
            .describe("Optional parameters for the script"),
        })
        .describe("Script to execute on matching documents"),
      conflicts: z
        .enum(["abort", "proceed"])
        .optional()
        .describe("What to do when version conflicts occur during the update"),
      maxDocs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Limit the number of documents to update"),
      refresh: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Should the index be refreshed after the update (defaults to true)"
        ),
    },
    async ({ index, query, script, conflicts, maxDocs, refresh }) => {
      try {
        // Create the params object with the correct type structure
        const params: Record<string, any> = {
          index,
          body: {
            query,
            script: {
              source: script.source,
              params: script.params,
            },
          },
          refresh: refresh !== false, // true by default unless explicitly set to false
        };

        // Add optional parameters
        if (conflicts) params.conflicts = conflicts;
        if (maxDocs) params.max_docs = maxDocs;

        const response = await esService.updateByQuery(params);

        // Format the response for better readability
        let resultText = `Update by query completed successfully in index '${index}':\n`;
        resultText += `- Total documents processed: ${response.total}\n`;
        resultText += `- Documents updated: ${response.updated}\n`;
        resultText += `- Documents that failed: ${
          response.failures?.length || 0
        }\n`;
        resultText += `- Time taken: ${response.took}ms`;

        // Add more detailed information if there were failures
        if (response.failures && response.failures.length > 0) {
          resultText += "\n\nFailures:";
          response.failures
            .slice(0, 5)
            .forEach((failure: any, index: number) => {
              resultText += `\n${index + 1}. ID: ${failure.id}, Reason: ${
                failure.cause?.reason || "Unknown"
              }`;
            });

          if (response.failures.length > 5) {
            resultText += `\n...and ${
              response.failures.length - 5
            } more failures.`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      } catch (error) {
        console.error(
          `Update by query failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 10: Delete documents by query
  server.tool(
    "delete_by_query",
    "Delete documents in an Elasticsearch index based on a query",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to delete documents from"),
      query: z
        .record(z.any())
        .describe("Elasticsearch query to select documents for deletion"),
      conflicts: z
        .enum(["abort", "proceed"])
        .optional()
        .describe(
          "What to do when version conflicts occur during the deletion"
        ),
      maxDocs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Limit the number of documents to delete"),
      refresh: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Should the index be refreshed after the deletion (defaults to true)"
        ),
    },
    async ({ index, query, conflicts, maxDocs, refresh }) => {
      try {
        const params: Record<string, any> = {
          index,
          body: {
            query,
          },
          refresh: refresh !== false, // true by default unless explicitly set to false
        };

        if (conflicts) params.conflicts = conflicts;
        if (maxDocs) params.max_docs = maxDocs;

        const response = await esService.deleteByQuery(params);

        // Format the response for better readability
        let resultText = `Delete by query completed successfully in index '${index}':\n`;
        resultText += `- Total documents processed: ${response.total}\n`;
        resultText += `- Documents deleted: ${response.deleted}\n`;
        resultText += `- Deletion failures: ${
          response.failures?.length || 0
        }\n`;
        resultText += `- Time taken: ${response.took}ms`;

        // Add version conflicts if any occurred
        if (response.version_conflicts && response.version_conflicts > 0) {
          resultText += `\n- Version conflicts: ${response.version_conflicts}`;
        }

        // Add detailed failure information
        if (response.failures && response.failures.length > 0) {
          resultText += "\n\nFailures:";
          response.failures.slice(0, 5).forEach((failure: any, idx: number) => {
            resultText += `\n${idx + 1}. ID: ${
              failure.id || "unknown"
            }, Reason: ${failure.cause?.reason || "Unknown"}`;
          });

          if (response.failures.length > 5) {
            resultText += `\n...and ${
              response.failures.length - 5
            } more failures.`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: resultText,
            },
          ],
        };
      } catch (error) {
        console.error(
          `Delete by query failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 11: Bulk operations
  server.tool(
    "bulk",
    "Perform multiple document operations (create, update, delete) in a single API call",
    {
      operations: z
        .array(
          z.object({
            action: z
              .enum(["index", "create", "update", "delete"])
              .describe(
                "The action to perform: index (create/replace), create (fail if exists), update, or delete"
              ),
            index: z
              .string()
              .trim()
              .min(1, "Index name is required")
              .describe("Name of the Elasticsearch index for this operation"),
            id: z
              .string()
              .optional()
              .describe(
                "Document ID (required for update and delete, optional for index/create)"
              ),
            document: z
              .record(z.any())
              .optional()
              .describe(
                "Document body (required for index/create/update, not used for delete)"
              ),
          })
        )
        .min(1, "At least one operation is required")
        .describe("Array of operations to perform in bulk"),
      pipeline: z
        .string()
        .optional()
        .describe("Optional pipeline to use for preprocessing documents"),
    },
    async ({ operations, pipeline }) => {
      try {
        // Validate operations
        operations.forEach((op, idx) => {
          if ((op.action === "update" || op.action === "delete") && !op.id) {
            throw new Error(
              `Operation #${idx + 1} (${op.action}): Document ID is required`
            );
          }
          if (
            (op.action === "index" ||
              op.action === "create" ||
              op.action === "update") &&
            !op.document
          ) {
            throw new Error(
              `Operation #${idx + 1} (${op.action}): Document body is required`
            );
          }
        });

        // Build the bulk operations array
        const bulkOperations: any[] = [];

        operations.forEach((op) => {
          const actionMeta: any = { _index: op.index };
          if (op.id) actionMeta._id = op.id;

          bulkOperations.push({ [op.action]: actionMeta });

          if (op.action !== "delete") {
            if (op.action === "update") {
              bulkOperations.push({ doc: op.document });
            } else {
              bulkOperations.push(op.document);
            }
          }
        });

        // Execute the bulk operation
        const response = await esService.bulk(bulkOperations, pipeline);

        // Process the response
        const summary = {
          took: response.took,
          errors: response.errors,
          successes: 0,
          failures: 0,
          actionResults: [] as any[],
        };

        // Count successes and failures
        response.items.forEach((item: any, idx: number) => {
          const actionType = Object.keys(item)[0];
          const result = item[actionType as keyof typeof item] as any;

          if (!result) return;

          if (result.error) {
            summary.failures++;
            summary.actionResults.push({
              operation: idx,
              action: actionType,
              id: result._id || "unknown",
              index: result._index || "unknown",
              status: result.status || 0,
              error: {
                type: result.error?.type || "unknown_error",
                reason: result.error?.reason || "Unknown error",
              },
            });
          } else {
            summary.successes++;
            summary.actionResults.push({
              operation: idx,
              action: actionType,
              id: result._id || "unknown",
              index: result._index || "unknown",
              status: result.status || 0,
              result: result.result || "unknown",
            });
          }
        });

        // Format the response
        let resultText = `Bulk operation completed in ${summary.took}ms\n`;
        resultText += `- Total operations: ${operations.length}\n`;
        resultText += `- Successful: ${summary.successes}\n`;
        resultText += `- Failed: ${summary.failures}\n`;

        // Add failure details
        if (summary.failures > 0) {
          resultText += "\nFailures:\n";
          const failures = summary.actionResults.filter((r) => r.error);
          failures.slice(0, 5).forEach((failure, idx) => {
            resultText += `${idx + 1}. Operation #${failure.operation} (${
              failure.action
            }): ${failure.error.reason} [${failure.error.type}]\n`;
          });

          if (failures.length > 5) {
            resultText += `...and ${failures.length - 5} more failures.\n`;
          }
        }

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error) {
        console.error(
          `Bulk operation failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 12: Create an index
  server.tool(
    "create_index",
    "Create a new Elasticsearch index with optional settings and mappings",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the new Elasticsearch index to create"),
      settings: z
        .record(z.any())
        .optional()
        .describe(
          "Optional index settings like number of shards, replicas, etc."
        ),
      mappings: z
        .record(z.any())
        .optional()
        .describe(
          "Optional index mappings defining field types and properties"
        ),
    },
    async ({ index, settings, mappings }) => {
      try {
        const response = await esService.createIndex(index, settings, mappings);
        return {
          content: [
            {
              type: "text",
              text: `Index '${index}' created successfully.`,
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to create index: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 13: Delete an index
  server.tool(
    "delete_index",
    "Delete an Elasticsearch index",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to delete"),
    },
    async ({ index }) => {
      try {
        await esService.deleteIndex(index);
        return {
          content: [
            { type: "text", text: `Index '${index}' deleted successfully.` },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to delete index: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 14: Count documents
  server.tool(
    "count_documents",
    "Count documents in an index, optionally filtered by a query",
    {
      index: z
        .string()
        .trim()
        .min(1, "Index name is required")
        .describe("Name of the Elasticsearch index to count documents in"),
      query: z
        .record(z.any())
        .optional()
        .describe("Optional Elasticsearch query to filter documents to count"),
    },
    async ({ index, query }) => {
      try {
        const count = await esService.countDocuments(index, query);
        return {
          content: [
            {
              type: "text",
              text: `Count of documents in index '${index}'${
                query ? " matching the provided query" : ""
              }: ${count}`,
            },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to count documents: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 15: Get index templates
  server.tool(
    "get_templates",
    "Get index templates from Elasticsearch",
    {
      name: z.string().optional().describe("Optional template name filter"),
    },
    async ({ name }) => {
      try {
        const templates = await esService.getIndexTemplates(name);
        return {
          content: [
            { type: "text", text: `Index Templates:` },
            { type: "text", text: JSON.stringify(templates, null, 2) },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to get templates: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool 16: Get index aliases
  server.tool(
    "get_aliases",
    "Get index aliases from Elasticsearch",
    {
      name: z.string().optional().describe("Optional alias name filter"),
    },
    async ({ name }) => {
      try {
        const aliases = await esService.getAliases(name);
        return {
          content: [
            { type: "text", text: `Index Aliases:` },
            { type: "text", text: JSON.stringify(aliases, null, 2) },
          ],
        };
      } catch (error) {
        console.error(
          `Failed to get aliases: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  return server;
}

// Get Elasticsearch configuration from environment variables
const config: ElasticsearchConfig = {
  url: process.env.ES_URL || "http://localhost:9200",
  apiKey: process.env.ES_API_KEY,
  username: process.env.ES_USERNAME,
  password: process.env.ES_PASSWORD,
  caCert: process.env.ES_CA_CERT,
  version: process.env.ES_VERSION || "8",
  sslSkipVerify:
    process.env.ES_SSL_SKIP_VERIFY === "1" ||
    process.env.ES_SSL_SKIP_VERIFY === "true",
  pathPrefix: process.env.ES_PATH_PREFIX,
};

// Main function to start the server
async function main(): Promise<void> {
  try {
    const transport = new StdioServerTransport();
    const server = await createOctodetElasticsearchMcpServer(config);

    await server.connect(transport);
    console.error("Octodet Elasticsearch MCP server running on stdio");

    // Handle termination signals
    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  } catch (error) {
    console.error(
      "Server error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
