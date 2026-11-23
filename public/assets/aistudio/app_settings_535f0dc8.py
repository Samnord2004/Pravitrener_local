from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.database import Base
import uuid

class AppSettings(Base):
    __tablename__ = "app_settings"
    __table_args__ = {"comment": "Глобальные настройки приложения"}

    id = Column(Integer, primary_key=True, default=1, comment="Всегда 1, единственная запись")
    support_email = Column(String, nullable=True, comment="Email поддержки")
    support_phone = Column(String, nullable=True, comment="Телефон поддержки")
    support_telegram = Column(String, nullable=True, comment="Telegram поддержки")
    support_whatsapp = Column(String, nullable=True, comment="WhatsApp поддержки")
    
    developer_name = Column(String, nullable=True, comment="Имя разработчика (ИП)")
    inn = Column(String, nullable=True, comment="ИНН")
    ogrnip = Column(String, nullable=True, comment="ОГРНИП")
    okved = Column(String, nullable=True, comment="ОКВЭД")
    okpo = Column(String, nullable=True, comment="ОКПО")
    legal_address = Column(Text, nullable=True, comment="Юридический адрес")
    
    bank_name = Column(String, nullable=True, comment="Название банка")
    bik = Column(String, nullable=True, comment="БИК")
    account_number = Column(String, nullable=True, comment="Расчётный счёт")
    correspondent_account = Column(String, nullable=True, comment="Корреспондентский счёт")
    
    psrn_cert_url = Column(String, nullable=True, comment="Ссылка на свидетельство ИНН")
    ogrnip_cert_url = Column(String, nullable=True, comment="Ссылка на свидетельство ОГРНИП")
    
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="Дата обновления")
