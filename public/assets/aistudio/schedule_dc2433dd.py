from sqlalchemy import Column, String, Date, Time, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.database import Base
import uuid

class Schedule(Base):
    __tablename__ = "schedules"
    __table_args__ = {"comment": "График работы тренеров"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    trainer_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False, comment="Дата")
    start_time = Column(Time, nullable=False, comment="Время начала")
    end_time = Column(Time, nullable=False, comment="Время окончания")
    is_available = Column(Boolean, default=True, comment="Доступен ли слот для записи")

    tenant = relationship("Tenant")
    trainer = relationship("User", foreign_keys=[trainer_id])
