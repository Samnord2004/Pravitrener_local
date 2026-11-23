from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Float, JSON, Integer
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import uuid

class Device(Base):
    __tablename__ = "devices"
    __table_args__ = {"comment": "Bluetooth устройства"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, comment="ID студии")
    user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, comment="Привязанный тренер")
    device_type = Column(String, nullable=False, comment="Тип: scale, heart_rate, blood_pressure, limb_scale, winch_scale")
    name = Column(String, nullable=False, comment="Название устройства")
    mac_address = Column(String, unique=True, nullable=False, comment="MAC-адрес")
    battery_level = Column(Integer, nullable=True, comment="Уровень заряда (%)")
    last_seen = Column(DateTime(timezone=True), nullable=True, comment="Последнее соединение")
    is_active = Column(Boolean, default=True, comment="Активно ли устройство")
    calibration_data = Column(JSON, nullable=True, comment="Данные калибровки")
    notes = Column(String, nullable=True, comment="Примечания")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant")
    user = relationship("User")
    measurements = relationship("Measurement", back_populates="device", cascade="all, delete-orphan")
