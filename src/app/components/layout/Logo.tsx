import logoImage from "@/assets/2c625871879c5a08c5f4449ddee643ddc2b6a278.png";

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <img
        src={logoImage}
        alt="CookLink.ai Logo"
        className="w-10 h-10 rounded-full object-cover"
      />
    </div>
  );
}


