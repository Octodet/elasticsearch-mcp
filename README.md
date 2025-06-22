# Octodet Elasticsearch MCP Server

A Model Context Protocol (MCP) server for Elasticsearch operations, providing a comprehensive set of tools for interacting with Elasticsearch clusters through the standardized Model Context Protocol. This server enables LLM-powered applications to search, update, and manage Elasticsearch data.

## Features

- **Complete Elasticsearch Operations**: Full CRUD operations for documents and indices
- **Bulk Operations**: Process multiple operations in a single API call
- **Query-Based Updates/Deletes**: Modify or remove documents based on queries
- **Cluster Management**: Monitor health, shards, and templates
- **Advanced Search**: Full support for Elasticsearch DSL queries with highlighting

## Installation

### As an NPM Package

Install the package globally:

```bash
npm install -g @octodet/elasticsearch-mcp
```

Or use it directly with npx:

```bash
npx @octodet/elasticsearch-mcp
```

### From Source

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Build the server:

```bash
npm run build
```

## Integration with MCP Clients

### VS Code Integration

Add the following configuration to your VS Code settings.json to integrate with the VS Code MCP extension:

```json
"mcp.servers": {
  "elasticsearch": {
    "command": "npx",
    "args": [
      "-y", "@octodet/elasticsearch-mcp"
    ],
    "env": {
      "ES_URL": "http://localhost:9200",
      "ES_API_KEY": "your_api_key",
      "ES_VERSION": "8"
    }
  }
}
```

### Claude Desktop Integration

Configure in your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "elasticsearch": {
      "command": "npx",
      "args": ["-y", "@octodet/elasticsearch-mcp"],
      "env": {
        "ES_URL": "http://localhost:9200",
        "ES_API_KEY": "your_api_key",
        "ES_VERSION": "8"
      }
    }
  }
}
```

### For Local Development

If you're developing the MCP server locally, you can configure the clients to use your local build:

```json
{
  "mcpServers": {
    "elasticsearch": {
      "command": "node",
      "args": ["path/to/build/index.js"],
      "env": {
        "ES_URL": "http://localhost:9200",
        "ES_API_KEY": "your_api_key",
        "ES_VERSION": "8"
      }
    }
  }
}
```

### Configuration

The server uses the following environment variables for configuration:

| Variable           | Description                    | Default               |
| ------------------ | ------------------------------ | --------------------- |
| ES_URL             | Elasticsearch server URL       | http://localhost:9200 |
| ES_API_KEY         | API key for authentication     |                       |
| ES_USERNAME        | Username for authentication    |                       |
| ES_PASSWORD        | Password for authentication    |                       |
| ES_CA_CERT         | Path to custom CA certificate  |                       |
| ES_VERSION         | Elasticsearch version (8 or 9) | 8                     |
| ES_SSL_SKIP_VERIFY | Skip SSL verification          | false                 |
| ES_PATH_PREFIX     | Path prefix for Elasticsearch  |                       |

## Tools

The server provides 16 MCP tools for Elasticsearch operations:

### 1. List Indices

List all available Elasticsearch indices with detailed information.

```json
{
  "indexPattern": "logs-*"
}
```

### 2. Get Mappings

Get field mappings for a specific Elasticsearch index.

```json
{
  "index": "my-index"
}
```

### 3. Search

Perform an Elasticsearch search with the provided query DSL and highlighting.

```json
{
  "index": "my-index",
  "queryBody": {
    "query": {
      "match": {
        "content": "search term"
      }
    },
    "size": 10,
    "from": 0
  }
}
```

### 4. Get Cluster Health

Get health information about the Elasticsearch cluster.

```json
{}
```

### 5. Get Shards

Get shard information for all or specific indices.

```json
{
  "index": "my-index" // optional
}
```

### 6. Add Document

Add a new document to a specific Elasticsearch index.

```json
{
  "index": "my-index",
  "id": "doc1", // optional
  "document": {
    "field1": "value1",
    "field2": "value2"
  }
}
```

### 7. Update Document

Update an existing document in a specific Elasticsearch index.

```json
{
  "index": "my-index",
  "id": "doc1",
  "document": {
    "field1": "new value"
  }
}
```

### 8. Delete Document

Delete a document from a specific Elasticsearch index.

```json
{
  "index": "my-index",
  "id": "doc1"
}
```

### 9. Update By Query

Update documents in an Elasticsearch index based on a query.

```json
{
  "index": "my-index",
  "query": {
    "term": {
      "status": "active"
    }
  },
  "script": {
    "source": "ctx._source.status = 'inactive'",
    "params": {
      "now": "2025-06-21"
    }
  },
  "conflicts": "proceed",
  "refresh": true
}
```

### 10. Delete By Query

Delete documents in an Elasticsearch index based on a query.

```json
{
  "index": "my-index",
  "query": {
    "range": {
      "date": {
        "lt": "2025-01-01"
      }
    }
  },
  "conflicts": "proceed",
  "refresh": true
}
```

### 11. Bulk Operations

Perform multiple document operations in a single API call.

```json
{
  "operations": [
    {
      "action": "index",
      "index": "my-index",
      "id": "doc1",
      "document": { "field": "value" }
    },
    {
      "action": "delete",
      "index": "my-index",
      "id": "doc2"
    }
  ]
}
```

### 12. Create Index

Create a new Elasticsearch index with optional settings and mappings.

```json
{
  "index": "new-index",
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "title": { "type": "text" },
      "created": { "type": "date" }
    }
  }
}
```

### 13. Delete Index

Delete an Elasticsearch index.

```json
{
  "index": "my-index"
}
```

### 14. Count Documents

Count documents in an index, optionally filtered by a query.

```json
{
  "index": "my-index",
  "query": {
    // optional
    "term": {
      "status": "active"
    }
  }
}
```

### 15. Get Templates

Get index templates from Elasticsearch.

```json
{
  "name": "template-name" // optional
}
```

### 16. Get Aliases

Get index aliases from Elasticsearch.

```json
{
  "name": "alias-name" // optional
}
```

## Development

### Running in Development Mode

Run the server in watch mode during development:

```bash
npm run dev
```

### Protocol Implementation

This server implements the [Model Context Protocol](https://github.com/modelcontextprotocol/modelcontextprotocol) to enable standardized communication between LLM clients and Elasticsearch. It provides a set of tools that can be invoked by MCP clients to perform various Elasticsearch operations.

### Adding New Tools

To add a new tool to the server:

1. Define the tool in `src/index.ts` using the MCP server's tool registration format
2. Implement the necessary functionality in `src/utils/elasticsearchService.ts`
3. Update this README to document the new tool

## Other MCP Clients

This server can be used with any MCP-compatible client, including:

- OpenAI's ChatGPT via MCP plugins
- Anthropic's Claude Desktop
- Claude in VS Code
- Custom applications using the MCP SDK

## Programmatic Usage

You can also use the server programmatically in your Node.js applications:

```javascript
import { createOctodetElasticsearchMcpServer } from "@octodet/elasticsearch-mcp";
import { CustomTransport } from "@modelcontextprotocol/sdk/server";

// Configure the Elasticsearch connection
const config = {
  url: "http://localhost:9200",
  apiKey: "your_api_key",
  version: "8",
};

// Create and start the server
async function startServer() {
  const server = await createOctodetElasticsearchMcpServer(config);

  // Connect to your custom transport
  const transport = new CustomTransport();
  await server.connect(transport);

  console.log("Elasticsearch MCP server started");
}

startServer().catch(console.error);
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
