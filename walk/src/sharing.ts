import {t} from './i18n';
import { invitationUrl, type Invitation } from "../shared/invitations";
import { isNative, serviceUrl } from "./native";
export const shareOrigin=()=>isNative()?serviceUrl(''):location.origin;
export function shareUrl(target: Invitation) {
  return invitationUrl(shareOrigin(), target);
}
export async function shareInvitation(
  title: string,
  url: string,
): Promise<"shared" | "copied" | "cancelled"> {
  try {
    if (isNative()) {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title,
        text: t("WALKで、この「好き」に集まろう。"),
        url,
        dialogTitle: t("WALKへ招待"),
      });
      return "shared";
    }
    if (navigator.share) {
      await navigator.share({ title, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || /cancel/i.test(error.message))
    )
      return "cancelled";
    throw error;
  }
}
