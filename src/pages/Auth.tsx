import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, ArrowRight, Mail } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Navigate } from "react-router-dom";

const Auth = () => {
  const { user, signInWithPassword, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState("");

  if (user) {
    return <Navigate to="/account" replace />;
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    try {
      const data = await requestOtp(formattedPhone);
      setRequestId(data.requestId);
      setStep("otp");
      toast.success("Код отправлен на " + formattedPhone);
    } catch {
      toast.error("Ошибка отправки кода");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;

    setLoading(true);
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
    try {
      await verifyOtp(formattedPhone, otp, requestId);
      toast.success("Вход выполнен!");
      navigate("/account");
    } catch {
      toast.error("Неверный код");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      await signInWithPassword(email, password);
      toast.success("Вход выполнен!");
      navigate("/account");
    } catch {
      toast.error("Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center bg-secondary/30 px-4">
        <div className="w-full max-w-sm">
          <div className="bg-card rounded-xl p-6 sm:p-8 shadow-card">
            {/* Mode tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => { setMode("phone"); setStep("phone"); }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "phone" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Phone className="w-4 h-4 inline mr-1" /> Телефон
              </button>
              <button
                onClick={() => setMode("email")}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "email" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                <Mail className="w-4 h-4 inline mr-1" /> Email
              </button>
            </div>

            {mode === "email" ? (
              <>
                <h1 className="font-heading font-bold text-xl text-center mb-2">Вход по Email</h1>
                <p className="text-sm text-muted-foreground text-center mb-6">Введите email и пароль</p>
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    type="password"
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full btn-gold" disabled={loading}>
                    {loading ? "Вход..." : "Войти"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="w-7 h-7 text-primary" />
                </div>
                <h1 className="font-heading font-bold text-xl text-center mb-2">
                  {step === "phone" ? "Вход в личный кабинет" : "Введите код"}
                </h1>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  {step === "phone"
                    ? "Введите номер телефона для получения SMS-кода"
                    : `Мы отправили код на ${phone.startsWith("+") ? phone : "+" + phone}`}
                </p>

                {step === "phone" ? (
                  <form onSubmit={handleSendOtp} className="space-y-4">
                    <Input
                      type="tel"
                      placeholder="+7 (___) ___-__-__"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                      className="text-center text-lg"
                    />
                    <Button type="submit" className="w-full btn-gold" disabled={loading}>
                      {loading ? "Отправка..." : "Получить код"}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <Button
                      onClick={handleVerifyOtp}
                      className="w-full btn-gold"
                      disabled={loading || otp.length !== 6}
                    >
                      {loading ? "Проверка..." : "Войти"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setStep("phone"); setOtp(""); }}
                      className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Изменить номер
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Auth;
