from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base
import uuid

class SensorReading(Base):
    __tablename__ = "sensor_readings"
    __table_args__ = {"comment": "Показания датчиков во время тренировки"}

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("training_sessions.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    heart_rate = Column(Integer, nullable=True)
    pressure_sys = Column(Integer, nullable=True)
    pressure_dia = Column(Integer, nullable=True)
    winch_weight = Column(Float, nullable=True)
    left_arm_weight = Column(Float, nullable=True)
    right_arm_weight = Column(Float, nullable=True)
    left_leg_weight = Column(Float, nullable=True)
    right_leg_weight = Column(Float, nullable=True)
    arm_angle = Column(Float, nullable=True)
    leg_angle = Column(Float, nullable=True)
    extra_data = Column(JSON, nullable=True)

    session = relationship("TrainingSession", back_populates="readings")
