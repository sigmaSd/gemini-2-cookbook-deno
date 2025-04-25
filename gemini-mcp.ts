import { Client } from "npm:@modelcontextprotocol/sdk@1.8.0/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk@1.8.0/client/stdio.js";
import {
  type Chat,
  type GenerateContentResponse,
  GoogleGenAI,
} from "npm:@google/genai@0.7.0";
import assert from "node:assert";

async function handleAiResp(
  { response, chat, mcpClients }: {
    response: GenerateContentResponse;
    chat: Chat;
    mcpClients: Client[];
  },
) {
  for (const candidate of response?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) console.log(part.text);
      if (part.functionCall) {
        const name = part.functionCall.name;
        assert(name);
        let client;
        // find the client the can handle this call
        for (const candidate of mcpClients) {
          for (
            // deno-lint-ignore no-explicit-any
            const tool of await (candidate.listTools() as any)
              // deno-lint-ignore no-explicit-any
              .then((r: any) => r.tools)
              // deno-lint-ignore no-explicit-any
              .then((tools: any) => tools.map((tool: any) => tool.name))
          ) {
            if (name === tool) {
              client = candidate;
              break;
            }
          }
        }

        // user interactive approval
        console.log(
          "## calling function:",
          name,
          "with args:",
          part.functionCall.args,
        );
        if (!confirm("> confirm?")) {
          const response = await chat.sendMessage({
            message: [{
              functionResponse: {
                name,
                response: { output: "User refused tool call" },
              },
            }],
          });
          await handleAiResp({ response, chat, mcpClients });
          continue;
        }

        // call the tool
        assert(client);
        const result = await client.callTool({
          name,
          arguments: part.functionCall.args,
          // deno-lint-ignore no-explicit-any
        }) as any;
        let chatResp;
        for (const content of result.content) {
          if (content.type === "image") {
            chatResp = await chat.sendMessage({
              message: [
                {
                  functionResponse: {
                    name,
                  },
                },
                {
                  inlineData: {
                    data: content.data,
                    mimeType: content.mimeType,
                  },
                },
              ],
            });
          } else {
            chatResp = await chat.sendMessage({
              message: { functionResponse: { name, response: content } },
            });
          }
          await handleAiResp({ response: chatResp, chat, mcpClients });
        }
      }
    }
  }
}

if (import.meta.main) {
  const transport = new StdioClientTransport({
    command: "deno",
    args: ["-A", "jsr:@sigmasd/add-mcp-demo"],
    env: Deno.env.toObject(),
  });
  const transport2 = new StdioClientTransport({
    command: "deno",
    args: ["-A", "jsr:@sigmasd/jsr-mcp"],
    env: Deno.env.toObject(),
  });

  const mcpClient = new Client(
    {
      name: "myClient",
      version: "1.0.0",
    },
  );

  await mcpClient.connect(transport);
  const mcpClient2 = new Client(
    {
      name: "myClient2",
      version: "1.0.0",
    },
  );

  await mcpClient2.connect(transport2);

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable not set.");
    Deno.exit(1);
  }
  const geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  // const MODEL_ID = "gemini-2.5-flash-preview-04-17";
  const MODEL_ID = "gemini-2.0-flash";
  // const MODEL_ID = "gemini-2.5-pro-exp-03-25";

  const mcpTools = await mcpClient.listTools();
  const tools = mcpTools.tools.map((tool) => {
    // Filter the parameters to exclude not supported keys
    const parameters = Object.fromEntries(
      Object.entries(tool.inputSchema).filter(([key]) =>
        !["additionalProperties", "$schema"].includes(key)
      ),
    );
    return {
      name: tool.name,
      description: tool.description,
      parameters: parameters,
    };
  });
  const mcpTools2 = await mcpClient2.listTools();
  const tools2 = mcpTools2.tools.map((tool) => {
    // Filter the parameters to exclude not supported keys
    const parameters = Object.fromEntries(
      Object.entries(tool.inputSchema).filter(([key]) =>
        !["additionalProperties", "$schema"].includes(key)
      ),
    );
    return {
      name: tool.name,
      description: tool.description,
      parameters: parameters,
    };
  });

  const chat = geminiClient.chats.create({
    model: MODEL_ID,
    config: {
      tools: [{ functionDeclarations: [...tools, ...tools2] }],
    },
  });

  console.log("Welcome to AI repl");
  console.log("exit using `:exit`");
  while (true) {
    const input = prompt(">");
    if (!input) continue;
    if (input === ":exit") break;
    const response = await chat.sendMessage({ message: input });

    await handleAiResp({ response, chat, mcpClients: [mcpClient, mcpClient2] });
  }
  await mcpClient.close();
}
