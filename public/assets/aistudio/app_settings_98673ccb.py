from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AppSettingsBase(BaseModel):
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    support_telegram: Optional[str] = None
    support_whatsapp: Optional[str] = None
    developer_name: Optional[str] = None
    inn: Optional[str] = None
    ogrnip: Optional[str] = None
    okved: Optional[str] = None
    okpo: Optional[str] = None
    legal_address: Optional[str] = None
    bank_name: Optional[str] = None
    bik: Optional[str] = None
    account_number: Optional[str] = None
    correspondent_account: Optional[str] = None
    psrn_cert_url: Optional[str] = None
    ogrnip_cert_url: Optional[str] = None

class AppSettingsUpdate(BaseModel):
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    support_telegram: Optional[str] = None
    support_whatsapp: Optional[str] = None
    developer_name: Optional[str] = None
    inn: Optional[str] = None
    ogrnip: Optional[str] = None
    okved: Optional[str] = None
    okpo: Optional[str] = None
    legal_address: Optional[str] = None
    bank_name: Optional[str] = None
    bik: Optional[str] = None
    account_number: Optional[str] = None
    correspondent_account: Optional[str] = None
    psrn_cert_url: Optional[str] = None
    ogrnip_cert_url: Optional[str] = None

class AppSettingsOut(AppSettingsBase):
    id: int
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
