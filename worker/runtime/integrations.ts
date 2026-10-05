import { ApiError, type SessionContext, type JsonRecord } from "./types";
import { entityPermission, scopedQuery } from "./permissions";
import { UnitOfWork } from "./entities";
import { configValue, providerFetch } from "./providers";
import { requireUser, superAdmin } from "./auth";
export async function uploadFile(
  session: SessionContext,
  file: Blob,
  name = "arquivo",
  purpose = "tasks",
  isPublic = false,
) {
  if (!session.internal) requireUser(session.user);
  if (!["tasks", "finance", "cartinhas", "branding"].includes(purpose))
    throw new ApiError(400, "Finalidade de arquivo inválida.");
  if (purpose === "cartinhas" && !session.internal)
    await requireLetterAuthor(session);
  if (isPublic && (!superAdmin(session.user) || purpose !== "branding"))
    throw new ApiError(403, "Upload público restrito ao branding.");
  if (file.size > (isPublic ? 10 : 25) * 1024 * 1024)
    throw new ApiError(413, "Arquivo excede o limite.");
  const id = crypto.randomUUID();
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  const path = `${id}/${clean}`;
  const bucket = isPublic ? "m31-public" : "m31-private";
  const { error } = await session.db.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) throw new ApiError(503, "Não foi possível armazenar o arquivo.");
  const { error: meta } = await session.db
    .from("m31_files")
    .insert({
      id,
      bucket,
      path,
      owner_id: session.user?.auth_id || null,
      purpose,
      original_name: clean,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
    });
  if (meta) {
    await session.db.storage.from(bucket).remove([path]);
    throw new ApiError(503, "Não foi possível registrar o arquivo.");
  }
  return {
    file_uri: `supabase://${bucket}/${path}`,
    file_url: `${session.env.APP_ORIGIN}/api/files/${id}`,
    id,
  };
}
export async function fileRecord(session: SessionContext, id: string) {
  const { data, error } = await session.db
    .from("m31_files")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new ApiError(404, "Arquivo não encontrado.");
  if (data.bucket === "m31-private" && !session.internal) {
    requireUser(session.user);
    if (!session.user.membro?.ativo)
      throw new ApiError(403, "Acesso revogado.");
    if (data.purpose === "cartinhas") {
      await requireLetterAuthor(session);
      return data;
    }
    const member = session.user.membro;
    const own = data.owner_id === session.user.auth_id;
    const finance =
      data.purpose === "finance" &&
      (superAdmin(session.user) || member?.pode_ver_financeiro);
    if (!own && !finance) {
      const { data: links } = await session.db
        .from("m31_file_links")
        .select("*")
        .eq("file_id", id);
      let allowed = false;
      const work = new UnitOfWork(
        session.db,
        false,
        configValue(session.env, "TOKEN_ENCRYPTION_KEY"),
      );
      for (const link of links || []) {
        try {
          entityPermission(link.entity, "get", session.user);
          const rows = await work
            .entity(link.entity)
            .filter(
              await scopedQuery(
                link.entity,
                { id: link.record_id },
                session.user,
                work,
              ),
            );
          if (rows.length) allowed = true;
        } catch {
          /* Every linked record is authorized independently. */
        }
      }
      if (!allowed) throw new ApiError(403, "Arquivo privado.");
    }
  }
  return data;
}
export async function downloadFile(session: SessionContext, id: string) {
  const meta = await fileRecord(session, id);
  const { data, error } = await session.db.storage
    .from(meta.bucket)
    .download(meta.path);
  if (error || !data) throw new ApiError(503, "Arquivo indisponível.");
  return new Response(data, {
    headers: {
      "Content-Type": meta.mime_type,
      "Cache-Control":
        meta.bucket === "m31-private"
          ? "no-store, private"
          : "public, max-age=3600",
      "Content-Disposition": `inline; filename="${meta.original_name}"`,
    },
  });
}
export async function coreIntegration(
  name: string,
  args: JsonRecord,
  session: SessionContext,
): Promise<any> {
  const fetchProvider = providerFetch(session);
  const env = session.env;
  if (name === "UploadFile" || name === "UploadPrivateFile")
    return uploadFile(
      session,
      args.file,
      args.file?.name || "arquivo",
      args.purpose || "tasks",
      args.public === true,
    );
  if (name === "CreateFileSignedUrl") {
    if (
      typeof args.file_uri !== "string" ||
      !args.file_uri.startsWith("supabase://")
    )
      throw new ApiError(400, "Referência de arquivo inválida.");
    const uri = args.file_uri.slice(11),
      slash = uri.indexOf("/");
    const bucket = uri.slice(0, slash),
      path = uri.slice(slash + 1);
    const { data: meta } = await session.db
      .from("m31_files")
      .select("id")
      .eq("bucket", bucket)
      .eq("path", path)
      .maybeSingle();
    if (!meta) throw new ApiError(404, "Arquivo não encontrado.");
    await fileRecord(session, meta.id);
    const { data, error } = await session.db.storage
      .from(bucket)
      .createSignedUrl(path, Math.min(args.expires_in || 600, 600));
    if (error || !data) throw new ApiError(503, "Arquivo indisponível.");
    return { signed_url: data.signedUrl, file_url: data.signedUrl };
  }
  if (name === "SendEmail") {
    const apiKey = configValue(env, "BREVO_API_KEY");
    if (!apiKey && env.PROVIDER_MODE !== "mock")
      throw new ApiError(503, "Configure BREVO_API_KEY.");
    const response = await fetchProvider(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          "api-key": apiKey || "LOCAL_MOCK",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            email: configValue(env, "EMAIL_FROM"),
            name: configValue(env, "EMAIL_FROM_NAME") || "M31",
          },
          to: [{ email: args.to }],
          subject: args.subject,
          htmlContent: args.body || args.htmlContent,
        }),
      },
    );
    if (!response.ok) throw new ApiError(503, "E-mail não enviado.");
    return response.json();
  }
  if (name === "InvokeLLM") {
    const schema = args.response_json_schema;
    if (env.PROVIDER_MODE === "mock") {
      if (env.APP_ENV !== "local" && env.APP_ENV !== "test")
        throw new ApiError(503, "Mock de IA indisponível.");
      const fill = (s: JsonRecord): unknown =>
        s.type === "array"
          ? []
          : s.type === "object"
            ? Object.fromEntries(
                Object.entries(s.properties || {}).map(([k, v]) => [
                  k,
                  fill(v as JsonRecord),
                ]),
              )
            : s.enum
              ? s.enum[0]
              : s.type === "boolean"
                ? false
                : s.type === "number" || s.type === "integer"
                  ? 0
                  : "VALIDACAO";
      return schema ? fill(schema) : "VALIDACAO — resposta sintética de IA.";
    }
    const apiKey = configValue(env, "OPENAI_API_KEY"),
      model = configValue(env, "OPENAI_TEXT_MODEL");
    if (!apiKey || !model)
      throw new ApiError(503, "Configure a chave e o modelo de texto OpenAI.");
    const input: JsonRecord[] = [
      {
        role: "user",
        content: [{ type: "input_text", text: String(args.prompt || "") }],
      },
    ];
    for (const fileUrl of args.file_urls || []) {
      let fileId: string;
      if (typeof fileUrl === "string" && fileUrl.startsWith("supabase://")) {
        const uri = fileUrl.slice(11),
          slash = uri.indexOf("/");
        const { data: record } = await session.db
          .from("m31_files")
          .select("id")
          .eq("bucket", uri.slice(0, slash))
          .eq("path", uri.slice(slash + 1))
          .maybeSingle();
        if (!record) throw new ApiError(404, "Arquivo de IA não encontrado.");
        fileId = record.id;
      } else {
        const url = new URL(fileUrl, env.APP_ORIGIN);
        if (
          url.origin !== new URL(env.APP_ORIGIN).origin ||
          !url.pathname.startsWith("/api/files/")
        )
          throw new ApiError(403, "Use arquivos internos para a IA.");
        fileId = url.pathname.split("/").at(-1)!;
      }
      const meta = await fileRecord(session, fileId);
      const { data, error } = await session.db.storage
        .from(meta.bucket)
        .download(meta.path);
      if (error || !data)
        throw new ApiError(503, "Arquivo de IA indisponível.");
      if (meta.mime_type.startsWith("audio/")) {
        const transcription = await coreIntegration(
          "TranscribeAudio",
          { file_id: meta.id },
          session,
        );
        input[0].content.push({ type: "input_text", text: transcription.text });
      } else {
        if (data.size > 10 * 1024 * 1024)
          throw new ApiError(413, "Arquivo muito grande para IA.");
        const bytes = new Uint8Array(await data.arrayBuffer());
        let encoded = "";
        for (let i = 0; i < bytes.length; i += 8192)
          encoded += String.fromCharCode(...bytes.slice(i, i + 8192));
        input[0].content.push(
          meta.mime_type.startsWith("image/")
            ? {
                type: "input_image",
                image_url: `data:${meta.mime_type};base64,${btoa(encoded)}`,
              }
            : {
                type: "input_file",
                filename: meta.original_name,
                file_data: `data:${meta.mime_type};base64,${btoa(encoded)}`,
              },
        );
      }
    }
    const request: JsonRecord = {
      model: configValue(env, "OPENAI_TEXT_MODEL"),
      input,
      store: false,
    };
    if (schema)
      request.text = {
        format: {
          type: "json_schema",
          name: "m31_result",
          strict: true,
          schema: strictSchema(schema),
        },
      };
    const response = await fetchProvider(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
    );
    const body = (await response.json()) as JsonRecord;
    if (!response.ok) throw new ApiError(503, "IA indisponível.");
    const output = (body.output || [])
      .flatMap((item: JsonRecord) => item.content || [])
      .filter((item: JsonRecord) => item.type === "output_text")
      .map((item: JsonRecord) => item.text)
      .join("");
    if (!output)
      throw new ApiError(503, "A IA não retornou conteúdo utilizável.");
    if (schema) {
      try {
        return JSON.parse(output);
      } catch {
        throw new ApiError(503, "Resposta estruturada inválida.");
      }
    }
    return output;
  }
  if (name === "TranscribeAudio") {
    if (
      env.PROVIDER_MODE === "mock" &&
      !["local", "test"].includes(env.APP_ENV)
    )
      throw new ApiError(503, "Mocks permitidos somente em desenvolvimento.");
    let id = args.file_id;
    if (!id && args.audio_url) {
      const url = new URL(args.audio_url, env.APP_ORIGIN);
      if (
        url.origin !== new URL(env.APP_ORIGIN).origin ||
        !/^\/api\/files\/[^/]+$/.test(url.pathname)
      )
        throw new ApiError(403, "Áudio fora da aplicação.");
      id = url.pathname.split("/").at(-1);
    }
    if (!id) throw new ApiError(400, "Identificador de áudio obrigatório.");
    const meta = await fileRecord(session, id);
    const { data, error } = await session.db.storage
      .from(meta.bucket)
      .download(meta.path);
    if (error || !data) throw new ApiError(503, "Áudio indisponível.");
    if (!meta.mime_type.startsWith("audio/"))
      throw new ApiError(415, "Arquivo não é áudio.");
    if (env.PROVIDER_MODE === "mock")
      return { text: "VALIDACAO — transcrição sintética." };
    const apiKey = configValue(env, "OPENAI_API_KEY"),
      model = configValue(env, "OPENAI_TRANSCRIPTION_MODEL");
    if (!apiKey || !model)
      throw new ApiError(503, "Configure OpenAI para transcrição.");
    const form = new FormData();
    form.set("file", data, meta.original_name);
    form.set("model", model);
    form.set("language", "pt");
    form.set("response_format", "json");
    const response = await fetchProvider(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
    );
    if (!response.ok) throw new ApiError(503, "Transcrição indisponível.");
    return response.json();
  }
  if (name === "ExtractDataFromUploadedFile")
    return {
      status: "success",
      output: await coreIntegration(
        "InvokeLLM",
        {
          prompt: "Extraia os dados do arquivo sem inventar informações.",
          response_json_schema: args.json_schema,
          file_urls: [args.file_url],
        },
        session,
      ),
    };
  throw new ApiError(404, "Integração fora do escopo M31.");
}
function strictSchema(value: JsonRecord): JsonRecord {
  const result = { ...value };
  if (result.type === "object") {
    result.additionalProperties = false;
    result.required = Object.keys(result.properties || {});
    result.properties = Object.fromEntries(
      Object.entries(result.properties || {}).map(([k, v]) => [
        k,
        strictSchema(v as JsonRecord),
      ]),
    );
  }
  if (result.items) result.items = strictSchema(result.items);
  return result;
}

export async function requireLetterAuthor(session: SessionContext) {
  requireUser(session.user);
  if (!session.user.membro?.ativo)
    throw new ApiError(403, "Acesso pastoral inativo.");
  const work = new UnitOfWork(
    session.db,
    false,
    configValue(session.env, "TOKEN_ENCRYPTION_KEY"),
  );
  const configs = await work.entity("EventoM31Config").list("created_date", 2);
  if (
    configs.length !== 1 ||
    configs[0].cartinha_autora_user_id !== session.user.id
  )
    throw new ApiError(403, "Arquivo pastoral restrito à autora.");
}
