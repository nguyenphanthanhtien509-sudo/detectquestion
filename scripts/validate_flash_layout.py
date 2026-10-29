Import("env")

# The generic Arduino builder always adds boot_app0.bin at 0xe000, which
# belongs to NVS in this factory-only layout. Never overwrite stored Wi-Fi
# credentials there on subsequent uploads.
images = env.get("FLASH_EXTRA_IMAGES", [])
env.Replace(FLASH_EXTRA_IMAGES=[
    item for item in images if not str(item[1]).replace("\\", "/").endswith("/boot_app0.bin")
])
# The platform builder may already have expanded FLASH_EXTRA_IMAGES into
# UPLOADERFLAGS before post scripts execute. Remove the offset/image pair
# there as well, so repeated uploads really preserve the NVS partition.
flags = list(env.get("UPLOADERFLAGS", []))
filtered = []
index = 0
while index < len(flags):
    if index + 1 < len(flags) and str(flags[index + 1]).replace("\\", "/").endswith("/boot_app0.bin"):
        index += 2
        continue
    filtered.append(flags[index])
    index += 1
env.Replace(UPLOADERFLAGS=filtered)
if int(env.subst("$ESP32_APP_OFFSET"), 0) != 0x20000:
    raise RuntimeError("Application upload offset must match factory partition at 0x20000")
