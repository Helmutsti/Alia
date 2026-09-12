/* Firma ad-hoc del bundle macOS, dopo che electron-builder l'ha costruito.
 *
 * ── Perché serve, visto che non abbiamo un certificato ──────────────────────
 *
 * Perché su Apple Silicon "non firmato" non vuol dire "non fidato": vuol dire
 * **non eseguibile**. Il kernel pretende una firma valida sul binario, e un
 * processo che non ce l'ha non riceve un avviso, viene ucciso.
 *
 * La firma ad-hoc (`--sign -`) non certifica nessuno e non dice a Gatekeeper
 * che siamo bravi: attesta solo che il codice è quello che era quando è stato
 * firmato. È esattamente quella che Electron mette sui propri binari, e basta
 * a far partire il processo. Gatekeeper protesterà lo stesso al primo avvio di
 * un file scaricato — quello si risolve con la notarizzazione, cioè con
 * l'account sviluppatore che per ora non c'è.
 *
 * ── Perché non lo fa già electron-builder ───────────────────────────────────
 *
 * Perché con `identity: null` salta la firma del tutto ("skipped macOS code
 * signing"), e quello che resta addosso al bundle è la firma che il *linker* ha
 * messo sull'eseguibile di Electron: identificatore `Electron`, e un sigillo
 * delle risorse che non corrisponde più a niente, perché builder nel frattempo
 * ha riscritto Info.plist, rinominato l'eseguibile e cambiato le icone.
 * `codesign --verify` su quel bundle dice, testualmente:
 *
 *     code has no resources but signature indicates they must be present
 *
 * ── `--deep`, che di solito non si usa ──────────────────────────────────────
 *
 * Apple lo sconsiglia per la distribuzione, e ha ragione: firma tutto quello
 * che trova senza che tu sappia cosa. Qui però è quello che serve, perché da
 * rifirmare non c'è solo il guscio — i processi aiutanti dentro
 * `Contents/Frameworks` hanno anche loro un Info.plist che builder ha
 * riscritto, e vanno firmati **prima** del guscio che li contiene. `--deep`
 * fa esattamente questo, dal basso verso l'alto.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

export default async function firmaAdHoc(contesto) {
  if (contesto.electronPlatformName !== "darwin") return;

  /* Il nome del bundle è quello del prodotto, che sta nella configurazione:
     leggerlo da lì invece di scrivere "Alia" qui significa che rinominando il
     prodotto questo script non resta indietro puntando a un percorso che non
     esiste più — fallirebbe, ma solo al prossimo rilascio per macOS. */
  const nome = contesto.packager.appInfo.productFilename;
  const bundle = join(contesto.appOutDir, `${nome}.app`);

  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", bundle], { stdio: "inherit" });

  /* Si controlla invece di sperare. `--strict` non si accontenta di una firma
     presente: verifica che il sigillo corrisponda a quello che c'è davvero nel
     bundle, che è precisamente ciò che era rotto prima. Se non passa, la build
     si ferma qui — un .dmg con dentro un'app che non parte è peggio di una
     build fallita, perché il difetto si scopre a valle. */
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", bundle], { stdio: "inherit" });
  console.log(`  • firma ad-hoc applicata e verificata  bundle=${bundle}`);
}
