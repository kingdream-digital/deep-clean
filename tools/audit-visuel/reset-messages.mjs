// Remet la messagerie dans l'état "avant groupes" : messages 1-à-1 de démo
// uniquement, sans conversation — pour rejouer la reprise et les tests API.
import { execSync } from "node:child_process";
const SQL = `DELETE FROM messages; DELETE FROM conversation_participants; DELETE FROM conversations; DELETE FROM notifications WHERE type='MESSAGE_RECEIVED';`;
execSync(`psql -h localhost -U postgres -d deep_clean -c "${SQL}"`, { stdio: "inherit" });
