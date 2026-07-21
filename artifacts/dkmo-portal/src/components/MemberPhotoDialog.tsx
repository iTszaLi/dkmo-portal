import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { RotateCw, Upload, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateMemberPhoto } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

async function cropToDataUrl(
  src: string,
  cropArea: Area,
  rotation: number,
): Promise<string> {
  const image = await loadImage(src);
  const radians = (rotation * Math.PI) / 180;

  // Draw the rotated image onto an intermediate canvas large enough to hold it.
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const bw = image.width * cos + image.height * sin;
  const bh = image.width * sin + image.height * cos;

  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = bw;
  rotCanvas.height = bh;
  const rotCtx = rotCanvas.getContext("2d");
  if (!rotCtx) throw new Error("Canvas not supported");
  rotCtx.translate(bw / 2, bh / 2);
  rotCtx.rotate(radians);
  rotCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const out = document.createElement("canvas");
  out.width = OUTPUT_SIZE;
  out.height = OUTPUT_SIZE;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    rotCanvas,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return out.toDataURL("image/jpeg", 0.85);
}

export function MemberPhotoDialog({
  memberId,
  memberName,
  photoUrl,
  open,
  onOpenChange,
  onSaved,
}: {
  memberId: string;
  memberName: string;
  photoUrl?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const updatePhoto = useUpdateMemberPhoto();

  const reset = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedArea(null);
    setSaving(false);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type.toLowerCase())) {
      toast({ title: "Please choose a JPG, PNG, or WEBP image", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const savePhoto = async () => {
    if (!imageSrc || !croppedArea) return;
    setSaving(true);
    try {
      const dataUrl = await cropToDataUrl(imageSrc, croppedArea, rotation);
      await updatePhoto.mutateAsync({ id: memberId, data: { photoUrl: dataUrl } });
      toast({ title: "Profile photo updated" });
      onSaved();
      close(false);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to save photo", variant: "destructive" });
      setSaving(false);
    }
  };

  const removePhoto = async () => {
    setSaving(true);
    try {
      await updatePhoto.mutateAsync({ id: memberId, data: { photoUrl: null } });
      toast({ title: "Profile photo removed" });
      onSaved();
      close(false);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to remove photo", variant: "destructive" });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-emerald-950 dark:text-slate-100">
            {imageSrc ? "Adjust Photo" : "Profile Photo"}
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            {imageSrc
              ? "Drag to reposition, zoom, and rotate. The photo is saved as a square and shown as a circle."
              : `Manage the passport photo for ${memberName}.`}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {imageSrc ? (
          <div className="space-y-4">
            <div className="relative h-72 w-full overflow-hidden rounded-xl bg-slate-950">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                rotation={rotation}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="flex items-center gap-3">
              <ZoomOut className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-emerald-600"
                aria-label="Zoom"
              />
              <ZoomIn className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-emerald-200 text-emerald-700 dark:border-slate-700 dark:text-emerald-400"
                onClick={() => setRotation((r) => (r + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={reset} disabled={saving}>
                Choose Different Photo
              </Button>
              <Button
                type="button"
                className="bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={savePhoto}
                disabled={saving || !croppedArea}
              >
                {saving ? "Saving…" : "Save Photo"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full justify-start bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
            >
              <Upload className="mr-2 h-4 w-4" /> Upload New Photo
            </Button>
            {photoUrl ? (
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={removePhoto}
                disabled={saving}
              >
                <Trash2 className="mr-2 h-4 w-4" /> {saving ? "Removing…" : "Remove Photo"}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => close(false)}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
