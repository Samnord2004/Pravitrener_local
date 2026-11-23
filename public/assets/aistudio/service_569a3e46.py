from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import uuid
import enum

class ServiceType(str, enum.Enum):
    SINGLE = "single"
    PACKAGE = "package"
    CERTIFICATE = "certificate"

class Service(Base):
    __tablename__ = "services"
    __table_args__ = {"comment": "Услуги студии (разовые, абонементы, сертификаты)"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False, comment="Название услуги")
    description = Column(Text, nullable=True)
    price = Column(Float, nullable=False, comment="Стоимость")
    type = Column(Enum(ServiceType), nullable=False, default=ServiceType.SINGLE)
    package_size = Column(Integer, nullable=True, comment="Количество занятий (для абонемента)")
    duration_minutes = Column(Integer, nullable=True, comment="Длительность одного занятия (для разовых)")
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    tenant = relationship("Tenant")
    purchases = relationship("ClientPurchase", back_populates="service")
