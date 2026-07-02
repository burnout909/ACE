import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashPin } from "@/lib/auth/pin";

// One-off: set an admin's password. Usage: tsx scripts/set-admin-pw.ts <pw> [ids...]
async function main() {
  const pw = process.argv[2];
  if (!pw) throw new Error("usage: set-admin-pw.ts <password> [adminId...]");
  const ids = process.argv.slice(3);
  const admins = ids.length
    ? await prisma.admin.findMany({ where: { id: { in: ids } } })
    : await prisma.admin.findMany();
  for (const a of admins) {
    const salt = randomBytes(16).toString("hex");
    await prisma.admin.update({
      where: { id: a.id },
      data: { passwordSalt: salt, passwordHash: hashPin(pw, salt) },
    });
    console.log(`updated ${a.id} ${a.name} <${a.email}>`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
