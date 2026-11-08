"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useT } from "@/components/LanguageProvider";
import { ADDRESS_MAX, type AddressForm, type AddressKey } from "@/lib/order-details";
import { PROVINCES } from "@/lib/regions";
import { loadRegions, type RegionMap } from "@/lib/wilayah";
import { inputCls } from "./auth-ui";

/** Satu kolom alamat: label, isian, dan pesan galat. Id kolom `<prefix>-<k>` dipakai label dan aria. */
function Field({ id, label, error, span, children }: { id: string; label: string; error?: string; span?: boolean; children: ReactNode }) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {children}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm font-medium text-coral">{error}</p>}
    </div>
  );
}

const cls = (err?: string) => `${inputCls}${err ? " !border-coral" : ""}`;
const disabledCls = "disabled:cursor-not-allowed disabled:bg-mist disabled:text-ink/50";
/** Nilai tersimpan yang tidak ada di daftar wilayah (mis. diketik manual) tetap tampil, bukan diam-diam kosong. */
const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);

/**
 * Kolom alamat kirim dengan pilihan provinsi, kota/kabupaten, dan kecamatan bertingkat (daftar wilayah dimuat per provinsi).
 * Bila daftar wilayah gagal dimuat, kota dan kecamatan menjadi isian teks supaya pengguna tetap bisa menyimpan.
 * Sama seperti form alamat di checkout, tetapi berdiri sendiri supaya halaman akun tidak bergantung pada halaman checkout.
 */
export function AddressFields({ value, onChange, errors, idPrefix }: {
  value: AddressForm;
  onChange: (next: AddressForm) => void;
  errors: Partial<Record<AddressKey, string>>;
  idPrefix: string;
}) {
  const t = useT();
  const [regions, setRegions] = useState<{ province: string; data: RegionMap | null; failed: boolean }>({ province: "", data: null, failed: false });
  useEffect(() => {
    const province = value.province;
    if (!province) return;
    let live = true;
    loadRegions(province).then((data) => { if (live) setRegions({ province, data, failed: false }); }).catch(() => { if (live) setRegions({ province, data: null, failed: true }); });
    return () => { live = false; };
  }, [value.province]);

  const set = (patch: Partial<AddressForm>) => onChange({ ...value, ...patch });
  const ready = !!value.province && regions.province === value.province && !!regions.data;
  const failed = !!value.province && regions.province === value.province && regions.failed;
  const cities = ready ? withCurrent(Object.keys(regions.data!), value.city) : [];
  const districts = ready && value.city ? withCurrent(regions.data![value.city] ?? [], value.district) : [];
  const lockedCity = !value.province ? t("co.addr.needProvince") : ready ? t("co.addr.cityPick") : t("co.addr.loadingRegions");
  const lockedDistrict = !value.province ? t("co.addr.needProvince") : !ready ? t("co.addr.loadingRegions") : !value.city ? t("co.addr.needCity") : t("co.addr.districtPick");
  const id = (k: AddressKey) => `${idPrefix}-${k}`;
  const text = (k: Exclude<AddressKey, "province">, auto: string, mode?: "numeric") => ({
    id: id(k), type: "text" as const, inputMode: mode, maxLength: ADDRESS_MAX[k], autoComplete: auto, placeholder: t(`co.addr.${k}Ph`),
    value: value[k], onChange: (e: { target: { value: string } }) => set({ [k]: e.target.value } as Partial<AddressForm>),
    "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${id(k)}-err` : undefined, className: cls(errors[k]),
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={id("recipient")} label={t("co.addr.recipient")} error={errors.recipient} span><input {...text("recipient", "name")} /></Field>
      <Field id={id("province")} label={t("co.addr.province")} error={errors.province}>
        <select id={id("province")} value={value.province} autoComplete="address-level1" className={cls(errors.province)} aria-invalid={!!errors.province} aria-describedby={errors.province ? `${id("province")}-err` : undefined}
          onChange={(e) => set({ province: e.target.value, city: "", district: "" })}>
          <option value="">{t("co.addr.provincePh")}</option>
          {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field id={id("city")} label={t("co.addr.city")} error={errors.city}>
        {failed ? (
          <>
            <input {...text("city", "address-level2")} />
            <p className="mt-1.5 text-xs text-ink/55">{t("co.addr.regionsFailed")}</p>
          </>
        ) : (
          <select id={id("city")} value={value.city} disabled={!ready} autoComplete="address-level2" className={`${cls(errors.city)} ${disabledCls}`} aria-invalid={!!errors.city} aria-describedby={errors.city ? `${id("city")}-err` : undefined}
            onChange={(e) => set({ city: e.target.value, district: "" })}>
            <option value="">{lockedCity}</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </Field>
      <Field id={id("district")} label={t("co.addr.district")} error={errors.district}>
        {failed ? (
          <input {...text("district", "address-level3")} />
        ) : (
          <select id={id("district")} value={value.district} disabled={!ready || !value.city} autoComplete="address-level3" className={`${cls(errors.district)} ${disabledCls}`} aria-invalid={!!errors.district} aria-describedby={errors.district ? `${id("district")}-err` : undefined}
            onChange={(e) => set({ district: e.target.value })}>
            <option value="">{lockedDistrict}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </Field>
      <Field id={id("postalCode")} label={t("co.addr.postalCode")} error={errors.postalCode}><input {...text("postalCode", "postal-code", "numeric")} /></Field>
      <Field id={id("street")} label={t("co.addr.street")} error={errors.street} span><input {...text("street", "street-address")} /></Field>
      <Field id={id("notes")} label={t("co.addr.notes")} error={errors.notes} span><input {...text("notes", "off")} /></Field>
    </div>
  );
}
