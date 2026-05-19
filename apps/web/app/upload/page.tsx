import { AppFrame } from "@/components/app-frame";
import { PageScaffold } from "@/components/page-scaffold";
import { UploadForm } from "@/components/upload-form";

export default function UploadPage() {
  return (
    <AppFrame>
      <PageScaffold
        eyebrow="Authorized Material Archiving"
        title="내 자료 아카이빙"
        description="직접 제작했거나 이용 권한을 보유한 자료를 문항 단위로 정리하세요."
      >
        <UploadForm />
      </PageScaffold>
    </AppFrame>
  );
}
