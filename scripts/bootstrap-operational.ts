import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

async function main() {
  let supabaseUrl = process.env.SUPABASE_URL;
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    try {
      const devVars = Object.fromEntries(
        (await readFile(".dev.vars", "utf8"))
          .split("\n")
          .filter((x) => x && !x.startsWith("#"))
          .map((x) => {
            const i = x.indexOf("=");
            return [x.slice(0, i).trim(), x.slice(i + 1).trim()];
          }),
      );
      supabaseUrl = supabaseUrl || devVars.SUPABASE_URL;
      supabaseKey = supabaseKey || devVars.SUPABASE_SERVICE_ROLE_KEY;
    } catch {
      // ignore
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error("Erro: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados em .dev.vars ou no ambiente.");
    process.exit(1);
  }

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = "paulobituadv+gestaom31@gmail.com";
  const password = "M31FILHAS";
  const legacyId = "LEGACY_gestao_operacional";
  const memberId = "MEMBER_gestao_operacional";

  console.log(`Configurando conta de gestão operacional: ${email}...`);

  let authId: string | null = null;
  const { data: identities } = await db
    .from("m31_identities")
    .select("auth_id")
    .eq("email", email)
    .maybeSingle();

  if (identities?.auth_id) {
    authId = String(identities.auth_id);
    console.log(`Conta já associada em m31_identities (auth_id: ${authId}). Atualizando senha para ${password}...`);
    const { error } = await db.auth.admin.updateUserById(authId, { password });
    if (error) {
      console.warn(`Aviso ao atualizar senha: ${error.message}`);
    }
  } else {
    console.log(`Criando usuário ${email} no Supabase Auth com senha ${password}...`);
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Gestão Operacional M31" },
    });

    if (error) {
      console.log(`Usuário já pode existir no Auth (${error.message}). Buscando por e-mail...`);
      const { data: userList } = await db.auth.admin.listUsers();
      const match = userList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (match) {
        authId = match.id;
        await db.auth.admin.updateUserById(authId, { password });
      } else {
        console.error(`Falha ao obter auth_id: ${error.message}`);
        process.exit(1);
      }
    } else {
      authId = created.user!.id;
    }
  }

  console.log(`Vinculando identidade m31_identities (auth_id: ${authId})...`);
  const { error: idError } = await db.from("m31_identities").upsert({
    auth_id: authId,
    legacy_user_id: legacyId,
    email,
    full_name: "Gestão Operacional M31",
    member_id: memberId,
    active: true,
  });
  if (idError) {
    console.error(`Erro ao atualizar m31_identities: ${idError.message}`);
    process.exit(1);
  }

  console.log(`Configurando perfil do membro EventoM31Membro (gestao_operacional)...`);
  const { error: memberError } = await db.from("m31_evento_m31_membro").upsert({
    id: memberId,
    payload: {
      id: memberId,
      user_email: email,
      nome: "Gestão Operacional M31",
      perfil: "gestao_operacional",
      ativo: true,
      operacoes_permitidas: ["inscritas", "voluntarias", "caravanas", "camisas"],
    },
  });
  if (memberError) {
    console.error(`Erro ao atualizar m31_evento_m31_membro: ${memberError.message}`);
    process.exit(1);
  }

  console.log("Sucesso! Conta de gestão operacional pronta para uso.");
  console.log("Credenciais para a equipe:");
  console.log("- Nome: Selecione no painel (Thaysa, Thalita, Dulce, Edilândia, Paulo...)");
  console.log("- WhatsApp: Digite seu telefone com DDD");
  console.log(`- Senha: ${password}`);
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
