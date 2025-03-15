# Gemini 2 CookBook Js

There are 2 sdks, the port of the new sdk is postfixed with `_new`, you should
prefer this sdk as it have more features, is unified with the other sdks, and is
seeing active development.

## New Sdk

Port of
[https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started.ipynb](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started.ipynb)
to [Deno](https://deno.com)

using [genai](https://github.com/googleapis/js-genai)

- get_started_new.ipynb (100% upstream commit: 09ef517)

**TODO:**

Finish porting the rest of the chapters in
[https://github.com/google-gemini/cookbook/blob/main/quickstarts](https://github.com/google-gemini/cookbook/blob/main/quickstarts)

## Old Sdk

Port of
[https://github.com/google-gemini/cookbook/tree/main/gemini-2](https://github.com/google-gemini/cookbook/tree/main/gemini-2)
to [Deno](https://deno.com)

Using [Generative AI JS](https://github.com/google-gemini/generative-ai-js)

- [x] get_started.ipynb (100%)

There are parts that are blocked waiting for the Multimodal live API
https://github.com/google-gemini/generative-ai-js/pull/306

Note that the new sdk supports this already.
