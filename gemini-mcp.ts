import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk/client/stdio.js";
import {
  Chat,
  FunctionDeclaration,
  GenerateContentResponse,
  GoogleGenAI,
  Type,
} from "npm:@google/genai@0.7.0";
import assert from "node:assert";

function isEmptyObject(obj: object) {
  return Object.keys(obj).length === 0;
}

// Define the Mapping
const typeStringMapping: { [key: string]: Type } = {
  number: Type.NUMBER,
  string: Type.STRING,
  boolean: Type.BOOLEAN,
  object: Type.OBJECT,
  array: Type.ARRAY,
  // Add other mappings as needed
};

/**
 * Recursively transforms an object or array by replacing string values
 * associated with a 'type' key with corresponding enum values from Type.
 * Creates a deep clone to avoid modifying the original object.
 *
 * @param data - The input data (object, array, or primitive) to transform.
 * @returns The transformed data with 'type' strings replaced by Type enum values.
 */
function transformTypes<T>(data: T): T {
  // Base case: If data is not an object or is null, return it directly
  if (typeof data !== "object" || data === null) {
    return data;
  }

  // Handle Arrays: recursively transform each element
  if (Array.isArray(data)) {
    // Use map to create a new array with transformed elements
    return data.map((item) => transformTypes(item)) as T;
  }

  // Handle Objects: create a new object and transform properties
  // deno-lint-ignore no-explicit-any
  const newData: { [key: string]: any } = {}; // Use a generic object type for the accumulator

  for (const key in data) {
    // Ensure we only process own properties (not from prototype chain)
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = data[key];

      // Check if this is the 'type' property we want to transform
      if (
        key === "type" && typeof value === "string" && typeStringMapping[value]
      ) {
        // If it's the 'type' key and the value is a string in our map,
        // replace it with the corresponding enum value.
        newData[key] = typeStringMapping[value];
      } else {
        // Otherwise, recursively transform the value (which could be an object, array, or primitive)
        newData[key] = transformTypes(value);
      }
    }
  }

  // Cast the result back to the original type T
  // This assumes the structure remains compatible
  return newData as T;
}

async function handleAiResp(
  { response, chat, mcpClient }: {
    response: GenerateContentResponse;
    chat: Chat;
    mcpClient: Client;
  },
) {
  for (const candidate of response?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) console.log(part.text);
      if (part.functionCall) {
        const name = part.functionCall.name;
        assert(name);
        const result = await mcpClient.callTool({
          name,
          arguments: part.functionCall.args,
        });
        const chatResp = await chat.sendMessage({
          message: { functionResponse: { name, response: result } },
        });
        await handleAiResp({ response: chatResp, chat, mcpClient });
      }
    }
  }
}

async function mcpToolsToGeminiFunctionDeclaration({
  mcpClient,
}: {
  mcpClient: Client;
}) {
  const tools = await mcpClient.listTools().then((r) => r.tools);
  // deno-lint-ignore no-explicit-any
  const fnDecls = tools.map((tool: any) => {
    const schema = structuredClone(transformTypes(tool.inputSchema));
    delete schema.additionalProperties;
    delete schema.$schema;

    const fnDecl = {
      name: tool.name,
      description: tool.description,
      // deno-lint-ignore no-explicit-any
    } as any;
    //FIXME: handle nested objects
    for (const [_key, val] of Object.entries(schema.properties)) {
      if (val && typeof val === "object" && !("type" in val)) {
        Object.assign(val, { type: Type.STRING });
      }
    }
    if (!isEmptyObject(schema.properties)) {
      fnDecl.parameters = schema;
    }
    return fnDecl as FunctionDeclaration;
  });
  return fnDecls;
}

if (import.meta.main) {
  const transport = new StdioClientTransport({
    command: "deno",
    // args:["./server.ts"],
    // args: ["--unstable-kv", "mcp-deno-kv/index.ts"],
    args: ["jsr:@sigmasd/add-mcp-demo"],
  });

  const mcpClient = new Client(
    {
      name: "myClient",
      version: "1.0.0",
    },
  );

  await mcpClient.connect(transport);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable not set.");
    Deno.exit(1);
  }
  const geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const MODEL_ID = "gemini-2.0-flash";

  const functionDeclarations = await mcpToolsToGeminiFunctionDeclaration(
    {
      mcpClient,
    },
  );

  const chat = geminiClient.chats.create({
    model: MODEL_ID,
    config: {
      tools: [{ functionDeclarations }],
    },
  });

  console.log("Welcome to AI repl");
  console.log("exit using `:exit`");
  while (true) {
    const input = prompt(">");
    if (!input) continue;
    if (input === ":exit") break;
    const response = await chat.sendMessage({ message: input });

    await handleAiResp({ response, chat, mcpClient });
  }
  await mcpClient.close();
}
