"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { API_URL, ExamTemplate, assetUrl, api } from "@/lib/api";

export function TemplateForm({ templateId }: { templateId?: string }) {
  const router = useRouter();
  const [template, setTemplate] = useState<ExamTemplate | null>(null);
  const [name, setName] = useState("");
  const [academyName, setAcademyName] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [examTitleField, setExamTitleField] = useState(true);
  const [classField, setClassField] = useState(true);
  const [studentNameField, setStudentNameField] = useState(true);
  const [dateField, setDateField] = useState(true);
  const [footerText, setFooterText] = useState("");
  const [fontSize, setFontSize] = useState(11);
  const [problemsPerPage, setProblemsPerPage] = useState(2);
  const [includeSolution, setIncludeSolution] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    api<ExamTemplate>(`/api/templates/${templateId}`).then((data) => {
      setTemplate(data);
      setName(data.name);
      setAcademyName(data.academy_name || "");
      setLogoPreview(data.logo_url ? assetUrl(data.logo_url) : "");
      setExamTitleField(data.header_fields.exam_title !== false);
      setClassField(data.header_fields.class_name !== false);
      setStudentNameField(data.header_fields.student_name !== false);
      setDateField(data.header_fields.date !== false);
      setFooterText(data.footer_text || "");
      setFontSize(data.font_size);
      setProblemsPerPage(data.problems_per_page);
      setIncludeSolution(data.include_solution);
    });
  }, [templateId]);

  function onLogoChange(file: File | null) {
    setLogo(file);
    setLogoPreview(file ? URL.createObjectURL(file) : template?.logo_url ? assetUrl(template.logo_url) : "");
  }

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const form = new FormData();
    form.append("name", name.trim());
    form.append("academy_name", academyName);
    if (logo) form.append("logo", logo);
    form.append("exam_title_field", String(examTitleField));
    form.append("class_field", String(classField));
    form.append("student_name_field", String(studentNameField));
    form.append("date_field", String(dateField));
    form.append("footer_text", footerText);
    form.append("font_size", String(fontSize));
    form.append("problems_per_page", String(problemsPerPage));
    form.append("include_solution", String(includeSolution));
    const response = await fetch(`${API_URL}/api/templates${templateId ? `/${templateId}` : ""}`, {
      method: templateId ? "PATCH" : "POST",
      body: form
    });
    setSaving(false);
    if (!response.ok) {
      window.alert(await response.text());
      return;
    }
    router.push("/templates");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader><CardTitle>{templateId ? "템플릿 편집" : "새 템플릿 만들기"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="템플릿 이름" value={name} onChange={(event) => setName(event.target.value)} />
          <Input placeholder="학원명" value={academyName} onChange={(event) => setAcademyName(event.target.value)} />
          <div className="space-y-2">
            <label className="text-sm font-medium">로고 업로드</label>
            <Input type="file" accept="image/png,image/jpeg" onChange={(event) => onLogoChange(event.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={examTitleField} onChange={(e) => setExamTitleField(e.target.checked)} />시험명</label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={classField} onChange={(e) => setClassField(e.target.checked)} />반</label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={studentNameField} onChange={(e) => setStudentNameField(e.target.checked)} />이름</label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={dateField} onChange={(e) => setDateField(e.target.checked)} />날짜</label>
          </div>
          <Input placeholder="하단 텍스트" value={footerText} onChange={(event) => setFooterText(event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium">글자 크기<Input type="number" min={9} max={14} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
            <label className="space-y-1 text-sm font-medium">문항 배치
              <select className="h-10 w-full rounded-md border bg-card/80 px-3" value={problemsPerPage} onChange={(event) => setProblemsPerPage(Number(event.target.value))}>
                <option value={1}>1단</option>
                <option value={2}>2단</option>
              </select>
            </label>
          </div>
          <label className="flex items-center justify-between rounded-md border p-3 text-sm">
            답안지 포함 기본값
            <input type="checkbox" checked={includeSolution} onChange={(event) => setIncludeSolution(event.target.checked)} />
          </label>
          <Button disabled={!name.trim() || saving} onClick={submit}><Save className="h-4 w-4" />저장</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>미리보기</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-white p-5 text-black shadow-sm">
            <div className="flex gap-4 rounded-md border border-zinc-200 p-3">
              <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded border bg-slate-50 text-xs text-slate-400">
                {logoPreview ? <img src={logoPreview} alt="로고 미리보기" className="max-h-full max-w-full object-contain" /> : "LOGO"}
              </div>
              <div className="space-y-1 text-sm">
                {academyName && <div className="font-semibold">{academyName}</div>}
                {examTitleField && <div>시험명: ___________</div>}
                <div>{classField && "반: _______  "}{studentNameField && "이름: _______  "}{dateField && "날짜: _____"}</div>
              </div>
            </div>
            <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: problemsPerPage === 2 ? "1fr 1fr" : "1fr" }}>
              <div className="rounded border p-3 text-sm">문 1. 문제 내용이 이 영역에 배치됩니다.</div>
              {problemsPerPage === 2 && <div className="rounded border p-3 text-sm">문 2. 두 번째 문항이 오른쪽에 배치됩니다.</div>}
            </div>
            {footerText && <div className="mt-5 text-center text-xs text-slate-500">{footerText}</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
