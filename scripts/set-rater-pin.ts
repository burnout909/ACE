import { prisma } from "@/lib/db/client";
import { hashPin } from "@/lib/auth/pin";

// One-off: set a rater's PIN. Usage: tsx scripts/set-rater-pin.ts <raterId> <pin>
async function main() {
  const [raterId, pin] = process.argv.slice(2);
  if (!raterId || !pin) throw new Error("usage: set-rater-pin.ts <raterId> <pin>");
  const rater = await prisma.rater.findUnique({ where: { id: raterId } });
  if (!rater) throw new Error(`no rater ${raterId}`);
  await prisma.rater.update({
    where: { id: raterId },
    data: { pinHash: hashPin(pin, rater.pinSalt) },
  });
  await prisma.pinAttempt.deleteMany({ where: { raterId } }); // clear any lockout
  console.log(`set ${raterId} PIN → ${pin}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
